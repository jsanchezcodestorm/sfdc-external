import { BadRequestException } from '@nestjs/common';

import type { EntityConfig } from '../entities.types';
import {
  NUMERIC_SEARCH_TYPES,
  WRITE_FIELD_API_NAME_PATTERN,
  type DescribeFieldMapLoader,
  type SalesforceFieldSummary,
  type WriteMode
} from '../entities.runtime.types';

import { isObjectRecord } from './entity-runtime-utils';

interface EntityWritePayloadPolicy {
  isRequiredFieldForMode(describe: SalesforceFieldSummary, mode: WriteMode): boolean;
  isSystemManagedFieldName(fieldName: string): boolean;
  isWritableFieldInMode(describe: SalesforceFieldSummary, mode: WriteMode): boolean;
  shouldExcludeFormField(fieldName: string, describe: SalesforceFieldSummary, mode: WriteMode): boolean;
}

export class EntityWritePayloadNormalizer {
  constructor(
    private readonly getDescribeFieldMap: DescribeFieldMapLoader,
    private readonly fieldPolicy: EntityWritePayloadPolicy
  ) {}

  async normalizeWritePayload(
    entityConfig: EntityConfig,
    payload: unknown,
    mode: WriteMode
  ): Promise<Record<string, unknown>> {
    if (!isObjectRecord(payload)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    const writableFields = this.resolveConfiguredWriteFieldSet(entityConfig);
    if (writableFields.size === 0) {
      throw new BadRequestException('Form writable fields are not configured for this entity');
    }

    const describeMap = await this.getDescribeFieldMap(entityConfig.objectApiName);
    const normalized: Record<string, unknown> = {};
    const missingRequiredFields: string[] = [];

    for (const fieldName of Object.keys(payload)) {
      if (fieldName === 'Id' || fieldName === 'attributes') {
        continue;
      }

      if (!WRITE_FIELD_API_NAME_PATTERN.test(fieldName)) {
        throw new BadRequestException(`Invalid field name in payload: ${fieldName}`);
      }
    }

    for (const fieldName of writableFields) {
      const describe = describeMap.get(fieldName);
      if (
        !describe ||
        this.fieldPolicy.shouldExcludeFormField(fieldName, describe, mode) ||
        !this.fieldPolicy.isWritableFieldInMode(describe, mode)
      ) {
        continue;
      }

      const rawValue = payload[fieldName];
      const hasOwnValue = Object.prototype.hasOwnProperty.call(payload, fieldName);
      if (!hasOwnValue || !this.hasProvidedFieldValue(rawValue, describe.type)) {
        if (this.fieldPolicy.isRequiredFieldForMode(describe, mode)) {
          missingRequiredFields.push(describe.label || fieldName);
        } else if (hasOwnValue) {
          normalized[fieldName] = null;
        }
        continue;
      }

      normalized[fieldName] = this.normalizeFieldValue(rawValue, describe.type, fieldName);
    }

    if (missingRequiredFields.length > 0) {
      throw new BadRequestException(`Missing required fields: ${missingRequiredFields.join(', ')}`);
    }

    if (Object.keys(normalized).length === 0) {
      throw new BadRequestException('No valid writable field found in payload');
    }

    return normalized;
  }

  resolveConfiguredWriteFieldSet(entityConfig: EntityConfig): Set<string> {
    const formFields = (entityConfig.form?.sections ?? [])
      .flatMap((section) => section.fields ?? [])
      .map((field) => field.field)
      .filter((fieldName): fieldName is string => typeof fieldName === 'string' && WRITE_FIELD_API_NAME_PATTERN.test(fieldName));

    const pathStatusField = entityConfig.detail?.pathStatus?.field;
    const fields = pathStatusField ? [...formFields, pathStatusField] : formFields;

    return new Set(
      fields.filter((fieldName) => !this.fieldPolicy.isSystemManagedFieldName(fieldName))
    );
  }

  normalizeFieldValue(value: unknown, fieldType: string, fieldName: string): string | number | boolean | null {
    if (value === null) {
      return null;
    }

    const normalizedType = fieldType.toLowerCase();

    if (normalizedType === 'boolean') {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') {
          return true;
        }

        if (normalized === 'false') {
          return false;
        }
      }

      throw new BadRequestException(`Invalid boolean value for field ${fieldName}`);
    }

    if (NUMERIC_SEARCH_TYPES.has(normalizedType)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      throw new BadRequestException(`Invalid numeric value for field ${fieldName}`);
    }

    if (normalizedType === 'date') {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }

      throw new BadRequestException(`Invalid date value for field ${fieldName}`);
    }

    if (normalizedType === 'datetime') {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }

      throw new BadRequestException(`Invalid datetime value for field ${fieldName}`);
    }

    if (normalizedType === 'multipicklist') {
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry)).join(';');
      }
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    throw new BadRequestException(`Invalid value type for field ${fieldName}`);
  }

  hasProvidedFieldValue(value: unknown, fieldType: string): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value);
    }

    if (fieldType.toLowerCase() === 'boolean') {
      return typeof value === 'boolean' || typeof value === 'string';
    }

    return true;
  }
}
