import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AggregateQuery,
  ObjectDescribe,
  ProviderCapabilities,
  QueryExecutionPlan,
  QueryResult,
  StructuredQuery
} from '@platform/contracts-connectors';

import { platformConnectorsJson, PlatformHttpError } from '../platform/platform-clients';

import {
  buildContactByEmailSoql,
  buildContactByIdSoql,
  buildContactSearchSoql,
  normalizeContactByEmailResult,
  normalizeContactByIdResult,
  normalizeContactSearchResult,
  type SalesforceContactLookup,
  type SalesforceContactSuggestion
} from './salesforce-contact.helpers';
import { SalesforceNotConfiguredException } from './salesforce-not-configured.exception';

interface SalesforceObjectSummary {
  name: string;
  label: string;
  custom: boolean;
}

export interface SalesforcePicklistValueSummary {
  value: string;
  label: string;
  active: boolean;
  defaultValue: boolean;
}

export interface SalesforceFieldSummary {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  defaultedOnCreate: boolean;
  calculated: boolean;
  autoNumber: boolean;
  picklistValues?: SalesforcePicklistValueSummary[];
  relationshipName?: string;
  referenceTo?: string[];
}

export interface SalesforceReadOnlyQueryResult {
  done: boolean;
  totalSize: number;
  records: Array<Record<string, unknown>>;
  nextCursor?: string;
  nextRecordsUrl?: string;
}

export interface DataSourceRequestOptions {
  dataSourceId?: string;
  describeSourceId?: string;
}

@Injectable()
export class SalesforceService {
  constructor(private readonly configService: ConfigService) {}

  async listSourceCapabilities(sourceId?: string): Promise<ProviderCapabilities> {
    const payload = await this.request<{ capabilities: ProviderCapabilities }>(
      this.buildSourcePath(this.resolveDataSourceId(sourceId), 'capabilities')
    );
    return payload.capabilities;
  }

  async describeGlobalObjects(options: DataSourceRequestOptions = {}): Promise<SalesforceObjectSummary[]> {
    const payload = await this.request<{ items: SalesforceObjectSummary[] }>(
      this.buildSourcePath(this.resolveDescribeSourceId(options), 'describe/objects')
    );
    return payload.items;
  }

  describeObject(objectName: string, options: DataSourceRequestOptions = {}): Promise<ObjectDescribe> {
    return this.request(
      this.buildSourcePath(
        this.resolveDescribeSourceId(options),
        `describe/objects/${encodeURIComponent(objectName)}`
      )
    );
  }

  async describeObjectFields(
    objectName: string,
    options: DataSourceRequestOptions = {}
  ): Promise<SalesforceFieldSummary[]> {
    const payload = await this.request<{ items: SalesforceFieldSummary[] }>(
      this.buildSourcePath(
        this.resolveDescribeSourceId(options),
        `describe/objects/${encodeURIComponent(objectName)}/fields`
      )
    );
    return payload.items;
  }

  async findContactByEmail(email: string): Promise<SalesforceContactLookup | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }

    const result = await this.executeReadOnlyQuery(
      buildContactByEmailSoql(normalizedEmail)
    );
    return normalizeContactByEmailResult(
      normalizedEmail,
      result as { records?: Array<Record<string, unknown>> }
    );
  }

  async findContactById(contactId: string): Promise<SalesforceContactLookup | null> {
    const normalizedContactId = contactId.trim();
    if (!normalizedContactId) {
      return null;
    }

    const result = await this.executeReadOnlyQuery(
      buildContactByIdSoql(normalizedContactId)
    );
    return normalizeContactByIdResult(result as { records?: Array<Record<string, unknown>> });
  }

  async searchContactsByIdOrName(
    query: string,
    limit: number
  ): Promise<SalesforceContactSuggestion[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length < 2) {
      throw new BadRequestException('q must contain at least 2 characters');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
      throw new BadRequestException('limit must be between 1 and 8');
    }

    const result = await this.executeReadOnlyQuery(
      buildContactSearchSoql(normalizedQuery, limit)
    );
    return normalizeContactSearchResult(result as { records?: Array<Record<string, unknown>> });
  }

  executeStructuredQuery(
    query: StructuredQuery,
    options: DataSourceRequestOptions = {}
  ): Promise<QueryResult> {
    return this.executeQueryPlan({ kind: 'structured', query }, options);
  }

  executeAggregateQuery(
    query: AggregateQuery,
    options: DataSourceRequestOptions = {}
  ): Promise<QueryResult> {
    return this.executeQueryPlan({ kind: 'aggregate', query }, options);
  }

  executeQueryPlan(
    query: QueryExecutionPlan,
    options: DataSourceRequestOptions = {}
  ): Promise<QueryResult> {
    return this.request(this.buildSourcePath(this.resolveDataSourceId(options.dataSourceId), 'query/run'), {
      method: 'POST',
      body: { query }
    });
  }

  executeQueryPlanPage(
    query: QueryExecutionPlan,
    pageSize: number,
    options: DataSourceRequestOptions = {}
  ): Promise<SalesforceReadOnlyQueryResult> {
    return this.request(this.buildSourcePath(this.resolveDataSourceId(options.dataSourceId), 'query/page'), {
      method: 'POST',
      body: { query, pageSize }
    });
  }

  executeQueryPlanMore(
    cursor: string,
    pageSize: number,
    options: DataSourceRequestOptions = {}
  ): Promise<SalesforceReadOnlyQueryResult> {
    return this.request(this.buildSourcePath(this.resolveDataSourceId(options.dataSourceId), 'query/more'), {
      method: 'POST',
      body: { cursor, pageSize }
    });
  }

  executeReadOnlyQuery(soql: string): Promise<unknown> {
    return this.request(this.buildSourcePath(this.resolveDataSourceId(), 'query/raw'), {
      method: 'POST',
      body: { soql }
    });
  }

  executeReadOnlyQueryPage(soql: string, pageSize: number): Promise<SalesforceReadOnlyQueryResult> {
    return this.request(this.buildSourcePath(this.resolveDataSourceId(), 'query/raw/page'), {
      method: 'POST',
      body: { soql, pageSize }
    });
  }

  executeReadOnlyQueryMore(
    locator: string,
    pageSize: number
  ): Promise<SalesforceReadOnlyQueryResult> {
    return this.request(this.buildSourcePath(this.resolveDataSourceId(), 'query/raw/more'), {
      method: 'POST',
      body: { cursor: locator, pageSize }
    });
  }

  async executeRawQuery(soql: string): Promise<unknown> {
    const rawQueryEnabled =
      this.configService.get<string>('ENABLE_RAW_SALESFORCE_QUERY', 'false') === 'true';

    if (!rawQueryEnabled) {
      throw new ForbiddenException('Raw Salesforce query endpoint is disabled');
    }

    return this.request(this.buildSourcePath(this.resolveDataSourceId(), 'query/raw'), {
      method: 'POST',
      body: { soql }
    });
  }

  createRecord(
    objectApiName: string,
    values: Record<string, unknown>,
    options: DataSourceRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.request(
      this.buildSourcePath(
        this.resolveDataSourceId(options.dataSourceId),
        `records/${encodeURIComponent(objectApiName)}`
      ),
      {
        method: 'POST',
        body: { values }
      }
    );
  }

  updateRecord(
    objectApiName: string,
    recordId: string,
    values: Record<string, unknown>,
    options: DataSourceRequestOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.request(
      this.buildSourcePath(
        this.resolveDataSourceId(options.dataSourceId),
        `records/${encodeURIComponent(objectApiName)}/${encodeURIComponent(recordId)}`
      ),
      {
        method: 'PUT',
        body: { values }
      }
    );
  }

  async deleteRecord(
    objectApiName: string,
    recordId: string,
    options: DataSourceRequestOptions = {}
  ): Promise<void> {
    await this.request<void>(
      this.buildSourcePath(
        this.resolveDataSourceId(options.dataSourceId),
        `records/${encodeURIComponent(objectApiName)}/${encodeURIComponent(recordId)}`
      ),
      {
        method: 'DELETE'
      }
    );
  }

  async ping(): Promise<void> {
    try {
      await this.request(this.buildSourcePath(this.resolveDataSourceId(), 'status'));
    } catch (error) {
      if (error instanceof SalesforceNotConfiguredException) {
        throw error;
      }

      throw error;
    }
  }

  private buildSourcePath(sourceId: string, suffix: string): string {
    const normalizedSuffix = suffix.replace(/^\/+/, '');
    return `/internal/connectors/sources/${encodeURIComponent(sourceId)}/${normalizedSuffix}`;
  }

  private resolveDataSourceId(sourceId?: string): string {
    return (
      sourceId?.trim() ||
      this.configService.get<string>('DEFAULT_DATA_SOURCE_ID')?.trim() ||
      'salesforce-default'
    );
  }

  private resolveDescribeSourceId(options: DataSourceRequestOptions): string {
    return (
      options.describeSourceId?.trim() ||
      this.configService.get<string>('DEFAULT_DESCRIBE_SOURCE_ID')?.trim() ||
      this.resolveDataSourceId(options.dataSourceId)
    );
  }

  private async request<T = unknown>(
    path: string,
    options?: Omit<RequestInit, 'body' | 'headers'> & {
      body?: BodyInit | Record<string, unknown>;
      headers?: HeadersInit;
    }
  ): Promise<T> {
    try {
      return await platformConnectorsJson<T>(path, options);
    } catch (error) {
      if (error instanceof PlatformHttpError) {
        if (error.getStatus() === 503) {
          throw new SalesforceNotConfiguredException();
        }

        if (error.getStatus() === 400) {
          throw new BadRequestException(error.message);
        }
      }

      throw error;
    }
  }
}
