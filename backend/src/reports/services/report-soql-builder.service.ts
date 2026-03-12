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
const AGGREGATE_OPERATIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);

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

  buildAggregateQuery(
    report: Pick<ReportDefinition, 'objectApiName' | 'filters'>,
    visibility: VisibilityEvaluation,
    input: {
      metricOperation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
      metricField?: string;
      dimensionField?: string;
      runtimeFilters?: ReportFilter[];
      limit?: number;
      sortDirection?: 'ASC' | 'DESC';
    }
  ): {
    soql: string;
    baseWhere?: string;
    finalWhere?: string;
    selectedFields: string[];
    dimensionField?: string;
    metricField?: string;
  } {
    const operation = input.metricOperation.toUpperCase();
    if (!AGGREGATE_OPERATIONS.has(operation)) {
      throw new BadRequestException(`Unsupported aggregate operation ${input.metricOperation}`);
    }

    const requestedFields = this.uniqueValues([
      ...(input.dimensionField ? [input.dimensionField] : []),
      ...(input.metricField ? [input.metricField] : [])
    ]);
    const visibleFields = this.applyFieldVisibility(requestedFields, visibility);
    const visibleFieldSet = new Set(visibleFields);

    if (input.dimensionField && !visibleFieldSet.has(input.dimensionField)) {
      throw new ForbiddenException(`Visibility denied dashboard dimension field ${input.dimensionField}`);
    }

    if (operation !== 'COUNT') {
      if (!input.metricField) {
        throw new BadRequestException(`Aggregate operation ${operation} requires metricField`);
      }
      if (!visibleFieldSet.has(input.metricField)) {
        throw new ForbiddenException(`Visibility denied dashboard metric field ${input.metricField}`);
      }
    }

    const objectApiName = this.toSoqlIdentifier(report.objectApiName);
    const whereContext = this.buildWhereContext(report.filters, input.runtimeFilters ?? [], visibility);
    const whereClause = whereContext.finalWhere ? ` WHERE ${whereContext.finalWhere}` : '';
    const dimensionIdentifier = input.dimensionField ? this.toSoqlIdentifier(input.dimensionField) : undefined;
    const aggregateExpression =
      operation === 'COUNT'
        ? 'COUNT(Id)'
        : `${operation}(${this.toSoqlIdentifier(input.metricField as string)})`;
    const metricExpression = `${aggregateExpression} metricValue`;
    const selectSegments = dimensionIdentifier ? [dimensionIdentifier, metricExpression] : [metricExpression];
    const groupByClause = dimensionIdentifier ? ` GROUP BY ${dimensionIdentifier}` : '';
    const orderByClause = dimensionIdentifier
      ? ` ORDER BY ${aggregateExpression} ${input.sortDirection === 'ASC' ? 'ASC' : 'DESC'}, ${dimensionIdentifier} ASC`
      : '';
    const limitClause = this.buildLimitClause(input.limit);

    return {
      soql: `SELECT ${selectSegments.join(', ')} FROM ${objectApiName}${whereClause}${groupByClause}${orderByClause}${limitClause}`,
      baseWhere: whereContext.baseWhere,
      finalWhere: whereContext.finalWhere,
      selectedFields: requestedFields,
      dimensionField: input.dimensionField,
      metricField: input.metricField
    };
  }

  buildDistinctValueQuery(
    report: Pick<ReportDefinition, 'objectApiName' | 'filters'>,
    visibility: VisibilityEvaluation,
    input: {
      field: string;
      runtimeFilters?: ReportFilter[];
      limit?: number;
    }
  ): {
    soql: string;
    baseWhere?: string;
    finalWhere?: string;
    selectedFields: string[];
  } {
    const visibleFields = this.applyFieldVisibility([input.field], visibility);
    if (!visibleFields.includes(input.field)) {
      throw new ForbiddenException(`Visibility denied dashboard filter field ${input.field}`);
    }

    const objectApiName = this.toSoqlIdentifier(report.objectApiName);
    const field = this.toSoqlIdentifier(input.field);
    const whereContext = this.buildWhereContext(report.filters, input.runtimeFilters ?? [], visibility);
    const whereClause = whereContext.finalWhere ? ` WHERE ${whereContext.finalWhere}` : '';
    const limitClause = this.buildLimitClause(input.limit);

    return {
      soql: `SELECT ${field}, COUNT(Id) optionCount FROM ${objectApiName}${whereClause} GROUP BY ${field} ORDER BY ${field} ASC${limitClause}`,
      baseWhere: whereContext.baseWhere,
      finalWhere: whereContext.finalWhere,
      selectedFields: [input.field]
    };
  }

  buildRowsQuery(
    report: Pick<ReportDefinition, 'objectApiName' | 'filters' | 'sort'>,
    visibility: VisibilityEvaluation,
    input: {
      columns: ReportColumn[];
      runtimeFilters?: ReportFilter[];
      limit?: number;
    }
  ): {
    soql: string;
    baseWhere?: string;
    finalWhere?: string;
    selectedFields: string[];
    visibleColumns: ReportColumn[];
  } {
    const compiled = this.buildReportQueries(
      {
        objectApiName: report.objectApiName,
        columns: input.columns,
        filters: [...report.filters, ...(input.runtimeFilters ?? [])],
        groupings: [],
        sort: report.sort,
        pageSize: input.limit ?? 50
      },
      visibility
    );

    return {
      soql: `${compiled.soql}${this.buildLimitClause(input.limit)}`,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      selectedFields: compiled.selectedFields,
      visibleColumns: compiled.visibleColumns
    };
  }

  filterVisibleFieldNames(fieldNames: string[], visibility: VisibilityEvaluation): string[] {
    return this.applyFieldVisibility(fieldNames, visibility);
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

  private buildWhereContext(
    staticFilters: ReportFilter[],
    runtimeFilters: ReportFilter[],
    visibility: VisibilityEvaluation
  ): {
    baseWhere?: string;
    finalWhere?: string;
  } {
    const whereConditions = [...staticFilters, ...runtimeFilters].map((filter) => this.compileFilter(filter));
    const baseWhere = whereConditions.length > 0 ? whereConditions.join(' AND ') : undefined;
    const finalWhere = this.composeWhere(baseWhere, visibility.compiledPredicate);

    return {
      baseWhere,
      finalWhere
    };
  }

  private buildLimitClause(limit: number | undefined): string {
    if (!limit) {
      return '';
    }

    if (!Number.isInteger(limit) || limit < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }

    return ` LIMIT ${limit}`;
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
