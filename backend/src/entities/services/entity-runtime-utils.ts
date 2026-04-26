import { BadRequestException } from '@nestjs/common';

import type { EntityQueryOperator } from '../entities.types';
import {
  SALESFORCE_ID_PATTERN,
  TEMPLATE_TOKEN_PATTERN,
  type LookupSearchContext
} from '../entities.runtime.types';

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function assertSalesforceRecordId(recordId: string): void {
  if (!SALESFORCE_ID_PATTERN.test(recordId)) {
    throw new BadRequestException('recordId must be a valid Salesforce id (15 or 18 chars)');
  }
}

export function toFieldLabel(fieldName: string): string {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token: string) => {
    const value = context[token];
    if (value === null || value === undefined) {
      return '';
    }

    return String(value);
  });
}

export function resolveRecordValue(record: Record<string, unknown>, fieldPath: string): unknown {
  const segments = fieldPath.split('.').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  let current: unknown = record;

  for (const segment of segments) {
    if (!isObjectRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

export function renderRecordTemplate(
  template: string | undefined,
  record: Record<string, unknown>
): string | undefined {
  if (!template || template.trim().length === 0) {
    return undefined;
  }

  const rendered = template.replace(TEMPLATE_TOKEN_PATTERN, (_match, rawExpr: string) => {
    const candidates = rawExpr.split('||').map((entry) => entry.trim()).filter((entry) => entry.length > 0);

    for (const candidate of candidates) {
      const value = resolveRecordValue(record, candidate);
      if (value !== null && value !== undefined && String(value).trim().length > 0) {
        return String(value);
      }
    }

    return '';
  });

  const normalized = rendered.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function readRecordStringValue(
  record: Record<string, unknown>,
  fieldPath: string
): string | undefined {
  const value = resolveRecordValue(record, fieldPath);
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function extractRecords(result: unknown): { records: Array<Record<string, unknown>>; totalSize: number } {
  if (!isObjectRecord(result)) {
    return { records: [], totalSize: 0 };
  }

  const rawRecords = result.records;
  const records = Array.isArray(rawRecords)
    ? rawRecords.filter((record): record is Record<string, unknown> => isObjectRecord(record))
    : [];
  const totalSize = typeof result.totalSize === 'number' ? result.totalSize : records.length;

  return { records, totalSize };
}

export function normalizeLookupSearchContext(value: unknown): LookupSearchContext {
  if (!isObjectRecord(value)) {
    return {};
  }

  const context: LookupSearchContext = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) {
      context[key] = entry;
      continue;
    }

    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      context[key] = entry;
      continue;
    }

    context[key] = String(entry);
  }

  return context;
}

export function normalizeLookupConditionOperator(value: string | undefined): EntityQueryOperator {
  if (!value || value.trim().length === 0) {
    return '=';
  }

  const normalized = value.trim().replace(/\s+/g, ' ').toUpperCase();
  switch (normalized) {
    case '=':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
    case 'IN':
    case 'NOT IN':
    case 'LIKE':
      return normalized;
    default:
      throw new BadRequestException(`Unsupported lookup operator: ${value}`);
  }
}
