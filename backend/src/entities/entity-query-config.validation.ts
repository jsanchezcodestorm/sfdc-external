import { BadRequestException } from '@nestjs/common';

import type {
  EntityQueryConfig,
  EntityQueryOperator,
  EntityQueryOrderBy,
  EntityQueryScalarValue,
  EntityQueryWhere,
} from './entities.types';

const ENTITY_QUERY_OBJECT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENTITY_QUERY_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const ENTITY_QUERY_OPERATORS = new Set<EntityQueryOperator>([
  '=',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'IN',
  'NOT IN',
  'LIKE',
]);

export function normalizeEntityQueryConfig(value: unknown, fieldName: string): EntityQueryConfig {
  const query = requireObject(value, `${fieldName} must be an object`);
  const objectApiName = requireString(query.object, `${fieldName}.object is required`);

  if (!ENTITY_QUERY_OBJECT_PATTERN.test(objectApiName)) {
    throw new BadRequestException(`${fieldName}.object must be a valid Salesforce object API name`);
  }

  const fields = normalizeFieldArray(query.fields, `${fieldName}.fields`);
  const where = normalizeWhereArray(query.where, `${fieldName}.where`);
  const orderBy = normalizeOrderBy(query.orderBy, `${fieldName}.orderBy`);
  const limit = normalizePositiveInteger(query.limit, `${fieldName}.limit`);

  return {
    object: objectApiName,
    fields,
    where,
    orderBy,
    limit,
  };
}

function normalizeFieldArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException(`${fieldName} must be an array of field paths`);
  }

  const normalized = value.map((entry, index) => normalizeFieldPath(entry, `${fieldName}[${index}]`));
  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function normalizeWhereArray(value: unknown, fieldName: string): EntityQueryWhere[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException(`${fieldName} must be an array`);
  }

  const normalized = value.map((entry, index) => normalizeWhereEntry(entry, `${fieldName}[${index}]`));
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeWhereEntry(value: unknown, fieldName: string): EntityQueryWhere {
  if (typeof value === 'string') {
    throw new BadRequestException(`${fieldName} raw string clauses are not supported`);
  }

  const entry = requireObject(value, `${fieldName} must be an object`);
  if (Object.hasOwn(entry, 'raw')) {
    throw new BadRequestException(`${fieldName}.raw is not supported`);
  }

  const field = normalizeFieldPath(entry.field, `${fieldName}.field`);
  const operator = normalizeOperator(entry.operator, `${fieldName}.operator`);

  if (!Object.hasOwn(entry, 'value')) {
    throw new BadRequestException(`${fieldName}.value is required`);
  }

  return {
    field,
    operator,
    value: normalizeWhereValue(entry.value, `${fieldName}.value`, operator),
  };
}

function normalizeOrderBy(value: unknown, fieldName: string): EntityQueryOrderBy[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException(`${fieldName} must be an array`);
  }

  const normalized = value.map((entry, index) => {
    const item = requireObject(entry, `${fieldName}[${index}] must be an object`);
    const field = normalizeFieldPath(item.field, `${fieldName}[${index}].field`);
    const direction = normalizeDirection(item.direction, `${fieldName}[${index}].direction`);

    return {
      field,
      direction,
    };
  });

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFieldPath(value: unknown, fieldName: string): string {
  const field = requireString(value, `${fieldName} is required`);
  if (!ENTITY_QUERY_FIELD_PATTERN.test(field)) {
    throw new BadRequestException(`${fieldName} must be a valid SOQL field path`);
  }

  return field;
}

function normalizeOperator(value: unknown, fieldName: string): EntityQueryOperator {
  if (value === undefined || value === null || value === '') {
    return '=';
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  const normalized = value.trim().replace(/\s+/g, ' ').toUpperCase() as EntityQueryOperator;
  if (!ENTITY_QUERY_OPERATORS.has(normalized)) {
    throw new BadRequestException(`${fieldName} must be one of =, !=, <, <=, >, >=, IN, NOT IN, LIKE`);
  }

  return normalized;
}

function normalizeWhereValue(
  value: unknown,
  fieldName: string,
  operator: EntityQueryOperator,
): EntityQueryWhere['value'] {
  if (operator === 'IN' || operator === 'NOT IN') {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException(`${fieldName} must be a non-empty array for ${operator}`);
    }

    return value.map((entry, index) => {
      const normalized = normalizeScalar(entry, `${fieldName}[${index}]`);
      if (normalized === null) {
        throw new BadRequestException(`${fieldName}[${index}] must not be null for ${operator}`);
      }

      return normalized;
    });
  }

  if (Array.isArray(value)) {
    throw new BadRequestException(`${fieldName} arrays are allowed only with IN or NOT IN`);
  }

  const normalized = normalizeScalar(value, fieldName);
  if (normalized === null && operator !== '=' && operator !== '!=') {
    throw new BadRequestException(`${fieldName} null is allowed only with = or !=`);
  }

  if (operator === 'LIKE' && typeof normalized !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string for LIKE`);
  }

  return normalized;
}

function normalizeScalar(value: unknown, fieldName: string): EntityQueryScalarValue {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value === null) {
    return null;
  }

  throw new BadRequestException(`${fieldName} must be a string, number, boolean, or null`);
}

function normalizeDirection(value: unknown, fieldName: string): EntityQueryOrderBy['direction'] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be ASC or DESC`);
  }

  const normalized = value.trim().toUpperCase();
  if (normalized !== 'ASC' && normalized !== 'DESC') {
    throw new BadRequestException(`${fieldName} must be ASC or DESC`);
  }

  return normalized as EntityQueryOrderBy['direction'];
}

function normalizePositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }

  return value;
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new BadRequestException(message);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(message);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new BadRequestException(message);
  }

  return normalized;
}
