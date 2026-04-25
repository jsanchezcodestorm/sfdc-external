import { BadRequestException, Injectable } from '@nestjs/common';

import type { DashboardAppliedFilter } from '../dashboards.types';
import { UUID_PATTERN } from '../dashboard-runtime.constants';
import type { ReportFilter, ReportScalarValue } from '../../reports/reports.types';

@Injectable()
export class DashboardValueService {
  normalizeReportFilterOperator(value: ReportFilter['operator'], fieldName: string): ReportFilter['operator'] {
    switch (value) {
      case '=':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=':
      case 'IN':
      case 'NOT IN':
      case 'LIKE':
        return value;
      default:
        throw new BadRequestException(`${fieldName} is invalid`);
    }
  }

  normalizeReportFilterValue(
    value: unknown,
    operator: ReportFilter['operator'],
    fieldName: string
  ): ReportScalarValue | ReportScalarValue[] {
    if (operator === 'IN' || operator === 'NOT IN') {
      if (!Array.isArray(value) || value.length === 0) {
        throw new BadRequestException(`${fieldName} must be a non-empty array`);
      }

      return value.map((entry, index) => this.normalizeScalarValue(entry, `${fieldName}[${index}]`));
    }

    return this.normalizeScalarValue(value, fieldName);
  }

  normalizeScalarValue(value: unknown, fieldName: string): ReportScalarValue {
    if (value === null) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    throw new BadRequestException(`${fieldName} must be string, number, boolean, or null`);
  }

  toEqualityReportFilter(filter: DashboardAppliedFilter): ReportFilter {
    return {
      field: filter.field,
      operator: '=',
      value: filter.value
    };
  }

  requireObject(value: unknown, message: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(message);
    }

    return value as Record<string, unknown>;
  }

  requireString(value: unknown, message: string): string {
    const normalized = this.asOptionalString(value);
    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  requireUuidString(value: unknown, fieldName: string): string {
    const normalized = this.requireString(value, `${fieldName} is required`);
    if (!UUID_PATTERN.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a UUID`);
    }

    return normalized;
  }

  requireInteger(value: unknown, message: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new BadRequestException(message);
    }

    return value;
  }

  asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  asOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return undefined;
  }

  assertUniqueFieldSequence(values: string[], fieldName: string): void {
    const normalizedValues = values.map((value) => value.trim());
    const uniqueValues = new Set(normalizedValues);
    if (uniqueValues.size !== normalizedValues.length) {
      throw new BadRequestException(`${fieldName} must not contain duplicates`);
    }
  }

  buildScalarKey(value: ReportScalarValue): string {
    if (value === null) {
      return 'null';
    }

    return `${typeof value}:${String(value)}`;
  }

  stringifyScalarValue(value: ReportScalarValue): string {
    if (value === null) {
      return 'Vuoto';
    }

    return String(value);
  }

  toScalarValue(value: unknown): ReportScalarValue {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return JSON.stringify(value);
  }

  toSafeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  extractRecords(result: unknown): Array<Record<string, unknown>> {
    if (!this.isObjectRecord(result) || !Array.isArray(result.records)) {
      return [];
    }

    return result.records.filter((record): record is Record<string, unknown> => this.isObjectRecord(record));
  }

  isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  buildSyntheticRowId(record: Record<string, unknown>): string {
    return JSON.stringify(record);
  }

  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
