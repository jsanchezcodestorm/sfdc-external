import { Injectable } from '@nestjs/common';

import { SalesforceService } from '../../salesforce/salesforce.service';
import type {
  ReportColumn,
  ReportGrouping,
  ReportRunGroupNode,
  ReportRunRow
} from '../reports.types';
import { ReportQueryCursorService } from './report-query-cursor.service';
import { ReportCursorExecutorService } from './report-cursor-executor.service';

@Injectable()
export class ReportRunResultMapperService {
  constructor(
    private readonly salesforceService: SalesforceService,
    private readonly reportQueryCursorService: ReportQueryCursorService,
    private readonly cursorExecutor: ReportCursorExecutorService
  ) {}

  mapRunRows(records: Array<Record<string, unknown>>, columns: ReportColumn[]): ReportRunRow[] {
    return records.map((record) => ({
      id: typeof record.Id === 'string' ? record.Id : this.buildSyntheticRowId(record),
      values: Object.fromEntries(
        columns.map((column) => [column.field, record[column.field]])
      )
    }));
  }

  async mapGroups(
    records: Array<Record<string, unknown>>,
    groupings: ReportGrouping[],
    countSoql: string | undefined
  ): Promise<ReportRunGroupNode[]> {
    if (groupings.length === 0) {
      return [];
    }

    return this.buildGroupTree(
      records,
      groupings,
      await this.loadGroupCounts(countSoql ?? '', groupings)
    );
  }

  private async loadGroupCounts(soql: string, groupings: ReportGrouping[]): Promise<Map<string, number>> {
    if (!soql || groupings.length === 0) {
      return new Map<string, number>();
    }

    const rawResult = await this.salesforceService.executeReadOnlyQuery(soql);
    const { records } = this.cursorExecutor.extractRecords(rawResult);
    const counts = new Map<string, number>();

    for (const record of records) {
      const key = this.buildGroupingKey(groupings.map((grouping) => record[grouping.field]));
      const countValue = record.groupedCount;
      const parsedCount = typeof countValue === 'number' ? countValue : Number(countValue);
      counts.set(key, Number.isFinite(parsedCount) ? parsedCount : 0);
    }

    return counts;
  }

  private buildGroupTree(
    records: Array<Record<string, unknown>>,
    groupings: ReportGrouping[],
    countsByKey: Map<string, number>,
    level = 0,
    prefixValues: unknown[] = []
  ): ReportRunGroupNode[] {
    if (level >= groupings.length) {
      return [];
    }

    const grouping = groupings[level];
    const buckets = new Map<string, { value: unknown; records: Array<Record<string, unknown>> }>();

    for (const record of records) {
      const value = record[grouping.field];
      const bucketKey = this.stringifyGroupValue(value);
      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.records.push(record);
        continue;
      }

      buckets.set(bucketKey, {
        value,
        records: [record]
      });
    }

    return [...buckets.values()].map((bucket) => {
      const keyParts = [...prefixValues, bucket.value];
      const key = this.buildGroupingKey(keyParts);
      const children = this.buildGroupTree(bucket.records, groupings, countsByKey, level + 1, keyParts);

      return {
        key,
        field: grouping.field,
        label: grouping.label?.trim() || grouping.field,
        value: bucket.value,
        count: countsByKey.get(key) ?? bucket.records.length,
        children: children.length > 0 ? children : undefined,
        rowIds: children.length === 0
          ? bucket.records
              .map((record) => String(record.Id ?? ''))
              .filter((value) => value.length > 0)
          : undefined
      } satisfies ReportRunGroupNode;
    });
  }

  private buildGroupingKey(values: unknown[]): string {
    return values.map((value) => this.stringifyGroupValue(value)).join('||');
  }

  private stringifyGroupValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '__null__';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value);
  }

  private buildSyntheticRowId(record: Record<string, unknown>): string {
    return this.reportQueryCursorService.hashFingerprint(Object.values(record).map((value) => {
      if (value === null || value === undefined) {
        return '';
      }

      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : JSON.stringify(value);
    }));
  }
}
