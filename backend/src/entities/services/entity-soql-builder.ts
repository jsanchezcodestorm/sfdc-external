import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type {
  EntityQueryConfig,
  EntityQueryScalarValue,
  EntityQueryWhere
} from '../entities.types';
import {
  NUMERIC_SEARCH_TYPES,
  SOQL_IDENTIFIER_PATTERN,
  TEXT_SEARCH_TYPES,
  type DescribeFieldMapLoader,
  type FieldVisibilityApplier,
  type SoqlBuildOptions,
  type SoqlBuildResult
} from '../entities.runtime.types';

import { renderTemplate, uniqueValues } from './entity-runtime-utils';

interface EntitySoqlBuilderDependencies {
  getDescribeFieldMap: DescribeFieldMapLoader;
  applyFieldVisibility: FieldVisibilityApplier;
}

export class EntitySoqlBuilder {
  constructor(private readonly dependencies: EntitySoqlBuilderDependencies) {}

  async buildSoqlFromQueryConfig(
    query: EntityQueryConfig,
    options: SoqlBuildOptions
  ): Promise<SoqlBuildResult> {
    const objectApiName = this.toSoqlIdentifier(query.object);
    const queryFields = Array.isArray(query.fields) && query.fields.length > 0 ? query.fields : ['Id'];
    const extraFields = Array.isArray(options.extraFields) ? options.extraFields : [];
    const requestedFields = uniqueValues(['Id', ...queryFields, ...extraFields]);
    const visibleRequestedFields = options.visibility
      ? this.dependencies.applyFieldVisibility(requestedFields, options.visibility)
      : requestedFields;

    if (visibleRequestedFields.length === 0) {
      throw new ForbiddenException('Visibility denied all requested fields');
    }

    const selectFields = visibleRequestedFields.map((field) => this.toSoqlIdentifier(field));

    const context = options.context ?? {};
    const whereConditions = this.compileWhereConditions(query.where ?? [], context);
    const searchCondition = await this.buildSearchCondition(query.object, options.search, options.searchConfig);
    if (searchCondition) {
      whereConditions.push(searchCondition);
    }

    const baseWhere = whereConditions.length > 0 ? whereConditions.join(' AND ') : undefined;
    const finalWhere = this.composeVisibilityWhere(baseWhere, options.visibility?.compiledPredicate);
    const whereClause = finalWhere ? ` WHERE ${finalWhere}` : '';
    const orderByClause = this.compileOrderByClause(query);

    const limitFromConfig = Number.isInteger(query.limit) && Number(query.limit) > 0 ? Number(query.limit) : undefined;
    const limit =
      typeof options.forcedLimit === 'number'
        ? options.forcedLimit
        : options.ignoreConfiguredLimit === true
          ? undefined
          : limitFromConfig;
    const limitClause = typeof limit === 'number' ? ` LIMIT ${limit}` : '';

    return {
      soql: `SELECT ${selectFields.join(', ')} FROM ${objectApiName}${whereClause}${orderByClause}${limitClause}`,
      baseWhere,
      finalWhere,
      selectFields
    };
  }

  compileWhereConditions(entries: EntityQueryWhere[], context: Record<string, unknown>): string[] {
    const conditions: string[] = [];

    for (const entry of entries) {
      const compiled = this.compileWhereEntry(entry, context);
      if (compiled) {
        conditions.push(compiled);
      }
    }

    return conditions;
  }

  compileWhereEntry(entry: EntityQueryWhere, context: Record<string, unknown>): string | null {
    const field = this.toSoqlIdentifier(entry.field);
    const operator = entry.operator;
    const resolvedValue = this.resolveQueryValue(entry.value, context);

    if (resolvedValue === null) {
      if (operator === '=') {
        return `${field} IS NULL`;
      }

      if (operator === '!=') {
        return `${field} IS NOT NULL`;
      }

      throw new BadRequestException(`Operator ${operator} does not accept null`);
    }

    if (Array.isArray(resolvedValue)) {
      if (operator !== 'IN' && operator !== 'NOT IN') {
        throw new BadRequestException(`Operator ${operator} does not accept an array value`);
      }

      const serializedArray = resolvedValue.map((value) => this.serializeSoqlValue(value)).join(', ');
      return `${field} ${operator} (${serializedArray})`;
    }

    return `${field} ${operator} ${this.serializeSoqlValue(resolvedValue)}`;
  }

  resolveQueryValue(
    value: EntityQueryScalarValue | EntityQueryScalarValue[],
    context: Record<string, unknown>
  ): EntityQueryScalarValue | EntityQueryScalarValue[] {
    if (Array.isArray(value)) {
      return value.map((entry) => this.resolveScalarQueryValue(entry, context));
    }

    return this.resolveScalarQueryValue(value, context);
  }

  resolveScalarQueryValue(
    value: EntityQueryScalarValue,
    context: Record<string, unknown>
  ): EntityQueryScalarValue {
    if (typeof value !== 'string') {
      return value;
    }

    const singleTokenMatch = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.exec(value);
    if (singleTokenMatch) {
      const tokenValue = context[singleTokenMatch[1]];
      return this.normalizeTemplateValue(tokenValue);
    }

    return renderTemplate(value, context);
  }

  normalizeTemplateValue(value: unknown): EntityQueryScalarValue {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    return String(value);
  }

  async buildSearchCondition(
    objectApiName: string,
    search: string | undefined,
    searchConfig: SoqlBuildOptions['searchConfig']
  ): Promise<string | null> {
    if (!search) {
      return null;
    }

    const minLength = Number.isInteger(searchConfig?.minLength) ? Number(searchConfig?.minLength) : 2;
    if (search.length < minLength) {
      return null;
    }

    const configuredFields = Array.isArray(searchConfig?.fields) ? searchConfig.fields : [];
    const validConfiguredFields = configuredFields.filter((field) => SOQL_IDENTIFIER_PATTERN.test(field));
    if (validConfiguredFields.length === 0) {
      return null;
    }

    const describeMap = await this.dependencies.getDescribeFieldMap(objectApiName);
    const searchClauses: string[] = [];

    for (const fieldName of validConfiguredFields) {
      const describe = describeMap.get(fieldName);
      if (!describe || !describe.filterable) {
        continue;
      }

      const normalizedType = describe.type.toLowerCase();
      if (TEXT_SEARCH_TYPES.has(normalizedType)) {
        searchClauses.push(`${fieldName} LIKE '%${this.escapeSoqlLiteral(search)}%'`);
        continue;
      }

      if (NUMERIC_SEARCH_TYPES.has(normalizedType)) {
        const numericValue = Number(search);
        if (Number.isFinite(numericValue)) {
          searchClauses.push(`${fieldName} = ${numericValue}`);
        }

        continue;
      }

      if (normalizedType === 'boolean') {
        const normalizedBoolean = search.toLowerCase();
        if (normalizedBoolean === 'true' || normalizedBoolean === 'false') {
          searchClauses.push(`${fieldName} = ${normalizedBoolean.toUpperCase()}`);
        }
      }
    }

    if (searchClauses.length === 0) {
      return null;
    }

    return `(${searchClauses.join(' OR ')})`;
  }

  compileOrderByClause(query: EntityQueryConfig): string {
    if (!Array.isArray(query.orderBy) || query.orderBy.length === 0) {
      return '';
    }

    const segments = query.orderBy
      .map((entry) => {
        if (!entry.field || entry.field.trim().length === 0) {
          return null;
        }

        const field = this.toSoqlIdentifier(entry.field);
        const direction = entry.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        return `${field} ${direction}`;
      })
      .filter((entry): entry is string => entry !== null);

    return segments.length > 0 ? ` ORDER BY ${segments.join(', ')}` : '';
  }

  composeVisibilityWhere(
    baseWhere: string | undefined,
    compiledPredicate: string | undefined
  ): string | undefined {
    const normalizedBase = baseWhere?.trim();
    const normalizedPredicate = compiledPredicate?.trim();

    if (!normalizedBase && !normalizedPredicate) {
      return undefined;
    }

    if (!normalizedBase) {
      return normalizedPredicate;
    }

    if (!normalizedPredicate) {
      return normalizedBase;
    }

    return `(${normalizedBase}) AND (${normalizedPredicate})`;
  }

  serializeSoqlValue(value: string | number | boolean | null): string {
    if (value === null) {
      return 'NULL';
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException('Invalid numeric SOQL value');
      }

      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return `'${this.escapeSoqlLiteral(value)}'`;
  }

  escapeSoqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  toSoqlIdentifier(identifier: string): string {
    if (!SOQL_IDENTIFIER_PATTERN.test(identifier)) {
      throw new BadRequestException(`Invalid SOQL identifier: ${identifier}`);
    }

    return identifier;
  }
}
