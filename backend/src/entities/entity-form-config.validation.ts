import { BadRequestException } from '@nestjs/common';

import type {
  EntityFormFieldConfig,
  EntityLookupCondition,
  EntityLookupConfig,
  EntityLookupOrderBy,
} from './entities.types';

const LEGACY_FORM_FIELD_KEYS = ['label', 'inputType', 'required'] as const;

export function normalizeEntityFormFieldConfig(
  value: unknown,
  fieldPath: string,
): EntityFormFieldConfig {
  const field = requireObject(value, `${fieldPath} must be an object`);
  rejectLegacyFormFieldKeys(field, fieldPath);

  return {
    field: requireString(field.field, `${fieldPath}.field is required`),
    placeholder: asOptionalString(field.placeholder),
    lookup: normalizeEntityLookupConfig(field.lookup, `${fieldPath}.lookup`),
  };
}

function normalizeEntityLookupConfig(
  value: unknown,
  fieldPath: string,
): EntityLookupConfig | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const lookup = requireObject(value, `${fieldPath} must be an object`);
  const searchField = asOptionalString(lookup.searchField);
  const where = normalizeLookupWhereArray(lookup.where, `${fieldPath}.where`);
  const orderBy = normalizeLookupOrderByArray(lookup.orderBy, `${fieldPath}.orderBy`);
  const prefill = typeof lookup.prefill === 'boolean' ? lookup.prefill : undefined;

  if (!searchField && !where && !orderBy && !prefill) {
    return undefined;
  }

  return {
    searchField,
    where,
    orderBy,
    prefill,
  };
}

function normalizeLookupWhereArray(
  value: unknown,
  fieldPath: string,
): EntityLookupCondition[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const entries = requireArray(value, `${fieldPath} must be an array`).map((entry, index) => {
    const where = requireObject(entry, `${fieldPath}[${index}] must be an object`);

    return {
      field: asOptionalString(where.field),
      operator: asOptionalString(where.operator),
      value: normalizeLookupScalar(where.value, `${fieldPath}[${index}].value`),
      parentRel: asOptionalString(where.parentRel),
    };
  });

  return entries.length > 0 ? entries : undefined;
}

function normalizeLookupOrderByArray(
  value: unknown,
  fieldPath: string,
): EntityLookupOrderBy[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const entries = requireArray(value, `${fieldPath} must be an array`).map((entry, index) => {
    const orderBy = requireObject(entry, `${fieldPath}[${index}] must be an object`);

    return {
      field: requireString(orderBy.field, `${fieldPath}[${index}].field is required`),
      direction: normalizeOrderByDirection(orderBy.direction, `${fieldPath}[${index}].direction`),
    };
  });

  return entries.length > 0 ? entries : undefined;
}

function normalizeLookupScalar(
  value: unknown,
  fieldPath: string,
): string | number | boolean | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  throw new BadRequestException(`${fieldPath} must be a string, number, boolean, or null`);
}

function normalizeOrderByDirection(
  value: unknown,
  fieldPath: string,
): EntityLookupOrderBy['direction'] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === 'ASC' || value === 'DESC' || value === 'asc' || value === 'desc') {
    return value;
  }

  throw new BadRequestException(`${fieldPath} must be ASC or DESC`);
}

function rejectLegacyFormFieldKeys(field: Record<string, unknown>, fieldPath: string): void {
  for (const legacyKey of LEGACY_FORM_FIELD_KEYS) {
    if (legacyKey in field) {
      throw new BadRequestException(`${fieldPath}.${legacyKey} is not supported`);
    }
  }
}

function requireArray(value: unknown, errorMessage: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(errorMessage);
  }

  return value;
}

function requireObject(value: unknown, errorMessage: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException(errorMessage);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, errorMessage: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(errorMessage);
  }

  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
