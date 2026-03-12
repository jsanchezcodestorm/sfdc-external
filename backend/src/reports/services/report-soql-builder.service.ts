import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import type { VisibilityEvaluation } from '../../visibility/visibility.types';
import type {
  ReportColumn,
  ReportDefinition,
  ReportFilter,
  ReportGrouping,
  ReportScalarValue,
  ReportSort
} from '../reports.types';

const SOQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

@Injectable()
export class ReportSoqlBuilderService {
  buildReportQueries(
    report: Pick<ReportDefinition, 'objectApiName' | 'columns' | 'filters' | 'groupings' | 'sort' | 'pageSize'>,
    visibility: VisibilityEvaluation
  ): {
    soql: string;
    countSoql?: string;
    baseWhere?: string;
    finalWhere?: string;
    selectedFields: string[];
    visibleColumns: ReportColumn[];
    visibleGroupings: ReportGrouping[];
  } {
    const objectApiName = this.toSoqlIdentifier(report.objectApiName);
    const requestedColumns = report.columns.length > 0 ? report.columns : [{ field: 'Id' }];
    const groupingFields = report.groupings.map((grouping) => grouping.field);
    const requestedFields = this.uniqueValues(['Id', ...requestedColumns.map((column) => column.field), ...groupingFields]);
    const visibleFields = this.applyFieldVisibility(requestedFields, visibility);

    if (visibleFields.length === 0) {
      throw new ForbiddenException('Visibility denied all report fields');
    }

    const visibleFieldSet = new Set(visibleFields);
    const visibleColumns = requestedColumns.filter((column) => visibleFieldSet.has(column.field));
    const visibleGroupings = report.groupings.filter((grouping) => visibleFieldSet.has(grouping.field));

    if (report.groupings.length > 0 && visibleGroupings.length !== report.groupings.length) {
      throw new ForbiddenException('Visibility denied one or more report grouping fields');
    }

    if (visibleColumns.length === 0) {
      throw new ForbiddenException('Visibility denied all report columns');
    }

    const whereConditions = report.filters.map((filter) => this.compileFilter(filter));
    const baseWhere = whereConditions.length > 0 ? whereConditions.join(' AND ') : undefined;
    const finalWhere = this.composeWhere(baseWhere, visibility.compiledPredicate);
    const whereClause = finalWhere ? ` WHERE ${finalWhere}` : '';

    const selectFields = this.uniqueValues(['Id', ...visibleColumns.map((column) => column.field), ...visibleGroupings.map((grouping) => grouping.field)])
      .map((field) => this.toSoqlIdentifier(field));
    const orderByClause = this.compileOrderByClause(visibleGroupings, report.sort);

    const soql = `SELECT ${selectFields.join(', ')} FROM ${objectApiName}${whereClause}${orderByClause}`;
    const countSoql = visibleGroupings.length > 0
      ? this.buildCountQuery(objectApiName, finalWhere, visibleGroupings)
      : undefined;

    return {
      soql,
      countSoql,
      baseWhere,
      finalWhere,
      selectedFields: selectFields,
      visibleColumns,
      visibleGroupings
    };
  }

  private buildCountQuery(
    objectApiName: string,
    finalWhere: string | undefined,
    groupings: ReportGrouping[]
  ): string {
    const groupingFields = groupings.map((grouping) => this.toSoqlIdentifier(grouping.field));
    const whereClause = finalWhere ? ` WHERE ${finalWhere}` : '';
    const orderByClause = groupingFields.length > 0 ? ` ORDER BY ${groupingFields.map((field) => `${field} ASC`).join(', ')}` : '';
    return `SELECT ${groupingFields.join(', ')}, COUNT(Id) groupedCount FROM ${objectApiName}${whereClause} GROUP BY ${groupingFields.join(', ')}${orderByClause}`;
  }

  private compileFilter(filter: ReportFilter): string {
    const field = this.toSoqlIdentifier(filter.field);
    const operator = filter.operator;
    const value = filter.value;

    if (value === null) {
      if (operator === '=') {
        return `${field} IS NULL`;
      }

      if (operator === '!=') {
        return `${field} IS NOT NULL`;
      }

      throw new BadRequestException(`Operator ${operator} does not accept null`);
    }

    if (Array.isArray(value)) {
      if (operator !== 'IN' && operator !== 'NOT IN') {
        throw new BadRequestException(`Operator ${operator} does not accept an array value`);
      }

      if (value.length === 0) {
        throw new BadRequestException(`Filter ${field} array value must not be empty`);
      }

      return `${field} ${operator} (${value.map((entry) => this.serializeSoqlValue(entry)).join(', ')})`;
    }

    return `${field} ${operator} ${this.serializeSoqlValue(value)}`;
  }

  private compileOrderByClause(groupings: ReportGrouping[], sort: ReportSort[]): string {
    const segments = [
      ...groupings.map((grouping) => `${this.toSoqlIdentifier(grouping.field)} ASC`),
      ...sort.map((entry) => {
        const field = this.toSoqlIdentifier(entry.field);
        const direction = entry.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        return `${field} ${direction}`;
      }),
      'Id ASC'
    ];

    const uniqueSegments = segments.filter((segment, index) => segments.indexOf(segment) === index);
    return uniqueSegments.length > 0 ? ` ORDER BY ${uniqueSegments.join(', ')}` : '';
  }

  private composeWhere(baseWhere: string | undefined, compiledPredicate: string | undefined): string | undefined {
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

  private applyFieldVisibility(requestedFields: string[], visibility: VisibilityEvaluation): string[] {
    let filtered = [...requestedFields];

    if (visibility.compiledFields && visibility.compiledFields.length > 0) {
      filtered = filtered.filter((field) =>
        visibility.compiledFields?.some((entry) => field === entry || field.startsWith(`${entry}.`))
      );
    }

    if (visibility.deniedFields && visibility.deniedFields.length > 0) {
      filtered = filtered.filter(
        (field) => !visibility.deniedFields?.some((entry) => field === entry || field.startsWith(`${entry}.`))
      );
    }

    return this.uniqueValues(filtered);
  }

  private serializeSoqlValue(value: ReportScalarValue): string {
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

  private escapeSoqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private toSoqlIdentifier(identifier: string): string {
    if (!SOQL_IDENTIFIER_PATTERN.test(identifier)) {
      throw new BadRequestException(`Invalid SOQL identifier: ${identifier}`);
    }

    return identifier;
  }

  private uniqueValues(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  }
}
