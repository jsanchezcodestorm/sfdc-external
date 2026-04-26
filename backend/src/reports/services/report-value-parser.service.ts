import { BadRequestException, Injectable } from '@nestjs/common';

import type { ReportFilter, ReportScalarValue } from '../reports.types';

@Injectable()
export class ReportValueParserService {
  normalizeFilterOperator(value: string, fieldName: string): ReportFilter['operator'] {
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

  normalizeFilterValue(value: unknown, operator: ReportFilter['operator'], fieldName: string): ReportScalarValue | ReportScalarValue[] {
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

  assertUniqueFieldSequence(values: string[], fieldName: string): void {
    const normalized = values.map((value) => value.trim()).filter((value) => value.length > 0);
    const unique = new Set(normalized);
    if (unique.size !== normalized.length) {
      throw new BadRequestException(`${fieldName} must not contain duplicate fields`);
    }
  }

  clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  requireObject(value: unknown, message: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(message);
    }

    return value as Record<string, unknown>;
  }

  requireString(value: unknown, message: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  requireUuidString(value: unknown, fieldName: string): string {
    const normalized = this.requireString(value, `${fieldName} is required`);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID`);
    }

    return normalized;
  }

  asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
