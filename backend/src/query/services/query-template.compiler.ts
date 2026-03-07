import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import type { VisibilityEvaluation } from '../../visibility/visibility.types';
import type { QueryTemplate, QueryTemplateParams } from '../query.types';

const SOQL_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const SOQL_OBJECT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const UNSUPPORTED_TOKENS = /\b(GROUP\s+BY|HAVING|TYPEOF|FOR\s+UPDATE|WITH\s+SECURITY_ENFORCED|USING\s+SCOPE)\b/i;

type ParsedTemplateSoql = {
  selectFields: string[];
  objectApiName: string;
  whereClause?: string;
  orderByClause?: string;
  limitClause?: string;
  offsetClause?: string;
};

@Injectable()
export class QueryTemplateCompiler {
  compile(template: QueryTemplate, params: QueryTemplateParams): string {
    const mergedParams: QueryTemplateParams = {
      ...(template.defaultParams ?? {}),
      ...params
    };

    return template.soql.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token: string) => {
      if (!Object.hasOwn(mergedParams, token)) {
        throw new BadRequestException(`Missing template parameter: ${token}`);
      }

      return this.serializeToken(token, mergedParams[token], template.maxLimit ?? 200);
    });
  }

  validateVisibilityCompatibleTemplate(template: QueryTemplate): void {
    this.parseSelectTemplateSoql(template.soql, template.objectApiName);
  }

  scopeCompiledSoql(
    compiledSoql: string,
    visibility: VisibilityEvaluation,
  ): { soql: string; baseWhere?: string; finalWhere?: string; selectedFields: string[] } {
    const parsed = this.parseSelectTemplateSoql(compiledSoql);
    const visibleFields = this.applyFieldVisibility(parsed.selectFields, visibility);

    if (visibleFields.length === 0) {
      throw new ForbiddenException('Visibility denied all selected query template fields');
    }

    const finalWhere = this.composeWhere(parsed.whereClause, visibility.compiledPredicate);
    return {
      soql: this.buildParsedQuery({
        ...parsed,
        selectFields: visibleFields,
        whereClause: finalWhere,
      }),
      baseWhere: parsed.whereClause,
      finalWhere,
      selectedFields: visibleFields,
    };
  }

  private serializeToken(token: string, value: unknown, maxLimit: number): string {
    if (token.toLowerCase().includes('limit')) {
      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maxLimit) {
        throw new BadRequestException(`Invalid ${token}; accepted range is 1..${maxLimit}`);
      }

      return String(parsed);
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException(`Invalid numeric value for ${token}`);
      }

      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (typeof value === 'string') {
      const escaped = value.replace(/'/g, "\\'");
      return `'${escaped}'`;
    }

    throw new BadRequestException(`Invalid value for ${token}`);
  }

  private parseSelectTemplateSoql(
    soql: string,
    expectedObjectApiName?: string,
  ): ParsedTemplateSoql {
    const normalized = soql.trim();
    if (!normalized) {
      throw new BadRequestException('template.soql is required');
    }

    if (!/^SELECT\b/i.test(normalized)) {
      throw new BadRequestException('template.soql must start with SELECT');
    }

    if (UNSUPPORTED_TOKENS.test(normalized)) {
      throw new BadRequestException('template.soql contains unsupported SOQL clauses');
    }

    const fromMatch = /^\s*SELECT\s+(.+?)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/is.exec(normalized);
    if (!fromMatch) {
      throw new BadRequestException('template.soql must be a single-object SELECT query');
    }

    const [, selectRaw, objectApiName, restRaw] = fromMatch;
    if (!SOQL_OBJECT_PATTERN.test(objectApiName)) {
      throw new BadRequestException('template.soql contains an invalid objectApiName');
    }

    if (expectedObjectApiName && objectApiName !== expectedObjectApiName) {
      throw new BadRequestException('template.objectApiName must match SOQL FROM object');
    }

    if (/\(\s*SELECT\b/i.test(selectRaw)) {
      throw new BadRequestException('template.soql does not support subqueries');
    }

    const selectFields = selectRaw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (selectFields.length === 0) {
      throw new BadRequestException('template.soql must select at least one field');
    }

    if (selectFields.some((field) => !SOQL_FIELD_PATTERN.test(field))) {
      throw new BadRequestException('template.soql select fields must be plain field paths');
    }

    const rest = restRaw.trim();
    const whereClause = this.extractClause(rest, 'WHERE', ['ORDER BY', 'LIMIT', 'OFFSET']);
    const orderByClause = this.extractClause(rest, 'ORDER BY', ['LIMIT', 'OFFSET']);
    const limitClause = this.extractClause(rest, 'LIMIT', ['OFFSET']);
    const offsetClause = this.extractClause(rest, 'OFFSET', []);

    return {
      selectFields,
      objectApiName,
      whereClause,
      orderByClause,
      limitClause,
      offsetClause,
    };
  }

  private extractClause(
    source: string,
    keyword: 'WHERE' | 'ORDER BY' | 'LIMIT' | 'OFFSET',
    stopKeywords: string[],
  ): string | undefined {
    const keywordPattern = new RegExp(`\\b${keyword}\\b`, 'i');
    const keywordMatch = keywordPattern.exec(source);
    if (!keywordMatch) {
      return undefined;
    }

    const clauseStart = keywordMatch.index + keywordMatch[0].length;
    const rest = source.slice(clauseStart);
    let clauseEnd = rest.length;

    for (const stopKeyword of stopKeywords) {
      const stopPattern = new RegExp(`\\b${stopKeyword}\\b`, 'i');
      const stopMatch = stopPattern.exec(rest);
      if (stopMatch && stopMatch.index < clauseEnd) {
        clauseEnd = stopMatch.index;
      }
    }

    const clause = rest.slice(0, clauseEnd).trim();
    return clause.length > 0 ? clause : undefined;
  }

  private applyFieldVisibility(
    requestedFields: string[],
    visibility: VisibilityEvaluation,
  ): string[] {
    let filtered = [...requestedFields];

    if (visibility.compiledFields && visibility.compiledFields.length > 0) {
      filtered = filtered.filter((field) =>
        visibility.compiledFields?.some(
          (entry) => field === entry || field.startsWith(`${entry}.`),
        ),
      );
    }

    if (visibility.deniedFields && visibility.deniedFields.length > 0) {
      filtered = filtered.filter(
        (field) =>
          !visibility.deniedFields?.some(
            (entry) => field === entry || field.startsWith(`${entry}.`),
          ),
      );
    }

    return [...new Set(filtered)];
  }

  private composeWhere(
    baseWhere: string | undefined,
    compiledPredicate: string | undefined,
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

  private buildParsedQuery(parsed: ParsedTemplateSoql): string {
    const whereClause = parsed.whereClause ? ` WHERE ${parsed.whereClause}` : '';
    const orderByClause = parsed.orderByClause ? ` ORDER BY ${parsed.orderByClause}` : '';
    const limitClause = parsed.limitClause ? ` LIMIT ${parsed.limitClause}` : '';
    const offsetClause = parsed.offsetClause ? ` OFFSET ${parsed.offsetClause}` : '';

    return `SELECT ${parsed.selectFields.join(', ')} FROM ${parsed.objectApiName}${whereClause}${orderByClause}${limitClause}${offsetClause}`;
  }
}
