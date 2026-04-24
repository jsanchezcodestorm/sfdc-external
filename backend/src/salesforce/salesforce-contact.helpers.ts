import { ForbiddenException } from '@nestjs/common';

export type SalesforceContactLookup = {
  id: string;
  name?: string;
  email?: string;
  recordTypeDeveloperName?: string;
};

export type SalesforceContactSuggestion = {
  id: string;
  name?: string;
  recordTypeDeveloperName?: string;
};

type SalesforceRawQueryResult = {
  records?: Array<Record<string, unknown>>;
};

export function buildContactByEmailSoql(email: string): string {
  return [
    'SELECT Id, Name, Email, RecordType.DeveloperName',
    'FROM Contact',
    `WHERE Email = '${escapeSoqlString(email)}'`,
    'LIMIT 2'
  ].join(' ');
}

export function buildContactByIdSoql(contactId: string): string {
  return [
    'SELECT Id, Name, Email, RecordType.DeveloperName',
    'FROM Contact',
    `WHERE Id = '${escapeSoqlString(contactId)}'`,
    'LIMIT 1'
  ].join(' ');
}

export function buildContactSearchSoql(query: string, limit: number): string {
  const escapedQuery = escapeSoqlString(query);
  return [
    'SELECT Id, Name, RecordType.DeveloperName',
    'FROM Contact',
    `WHERE Name LIKE '${escapedQuery}%' OR Id = '${escapedQuery}'`,
    'ORDER BY Name ASC, Id ASC',
    `LIMIT ${limit}`
  ].join(' ');
}

export function normalizeContactByEmailResult(
  email: string,
  result: SalesforceRawQueryResult
): SalesforceContactLookup | null {
  const records = readRecords(result);
  if (records.length === 0) {
    return null;
  }
  if (records.length > 1) {
    throw new ForbiddenException(`Multiple Contacts found for ${email}`);
  }

  return normalizeContactLookup(records[0]);
}

export function normalizeContactByIdResult(
  result: SalesforceRawQueryResult
): SalesforceContactLookup | null {
  const records = readRecords(result);
  return records.length > 0 ? normalizeContactLookup(records[0]) : null;
}

export function normalizeContactSearchResult(
  result: SalesforceRawQueryResult
): SalesforceContactSuggestion[] {
  return readRecords(result).map((entry) => ({
    id: String(entry.Id),
    name: typeof entry.Name === 'string' ? entry.Name : undefined,
    recordTypeDeveloperName: readRecordTypeDeveloperName(entry)
  }));
}

function normalizeContactLookup(entry: Record<string, unknown>): SalesforceContactLookup {
  return {
    id: String(entry.Id),
    name: typeof entry.Name === 'string' ? entry.Name : undefined,
    email: typeof entry.Email === 'string' ? entry.Email : undefined,
    recordTypeDeveloperName: readRecordTypeDeveloperName(entry)
  };
}

function readRecords(result: SalesforceRawQueryResult): Array<Record<string, unknown>> {
  return Array.isArray(result.records) ? result.records : [];
}

function readRecordTypeDeveloperName(entry: Record<string, unknown>): string | undefined {
  const recordType = entry.RecordType;
  if (!recordType || typeof recordType !== 'object' || Array.isArray(recordType)) {
    return undefined;
  }

  const developerName = (recordType as Record<string, unknown>).DeveloperName;
  return typeof developerName === 'string' ? developerName : undefined;
}

function escapeSoqlString(value: string): string {
  return value.replace(/'/g, "\\'");
}
