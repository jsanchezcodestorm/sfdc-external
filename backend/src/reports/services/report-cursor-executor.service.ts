import { BadRequestException, Injectable } from '@nestjs/common';

import { QueryAuditService } from '../../audit/query-audit.service';
import type { SessionUser } from '../../auth/session-user.interface';
import type { VisibilityEvaluation } from '../../visibility/visibility.types';
import { ReportQueryCursorService } from './report-query-cursor.service';

export interface ReportCursorExecutionInput {
  user: SessionUser;
  appId: string;
  reportId: string;
  pageSize: number;
  cursor?: string;
  objectApiName: string;
  resolvedSoql: string;
  baseWhere: string;
  finalWhere: string;
  visibility: VisibilityEvaluation;
  selectedFields: string[];
}

@Injectable()
export class ReportCursorExecutorService {
  constructor(
    private readonly queryAuditService: QueryAuditService,
    private readonly reportQueryCursorService: ReportQueryCursorService
  ) {}

  async execute(
    input: ReportCursorExecutionInput
  ): Promise<{ records: Array<Record<string, unknown>>; totalSize: number; nextCursor: string | null }> {
    const queryFingerprint = this.buildQueryFingerprint(input);

    if (input.cursor) {
      const cursor = await this.reportQueryCursorService.readCursor(input.cursor);
      this.assertCursorMatches(cursor, input, queryFingerprint);

      return this.materializeCursorPage({
        input,
        sourceLocator: cursor.sourceLocator,
        sourceRecords: cursor.sourceRecords,
        totalSize: cursor.totalSize,
        queryFingerprint
      });
    }

    const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryPageWithAudit({
      contactId: input.user.sub,
      queryKind: 'REPORT_RUN',
      targetId: input.reportId,
      objectApiName: input.objectApiName,
      resolvedSoql: input.resolvedSoql,
      visibility: input.visibility,
      baseWhere: input.baseWhere,
      finalWhere: input.finalWhere,
      pageSize: input.pageSize,
      metadata: {
        appId: input.appId,
        reportId: input.reportId,
        paginationMode: 'cursor',
        cursorPhase: 'initial',
        selectedFields: input.selectedFields
      }
    });
    const { records, totalSize } = this.extractRecords(rawQueryResult);
    const pageRecords = records.slice(0, input.pageSize);
    const remainingRecords = records.slice(input.pageSize);
    const nextCursor =
      remainingRecords.length > 0 || rawQueryResult.nextRecordsUrl
        ? await this.reportQueryCursorService.createCursor(
            {
              contactId: input.user.sub,
              appId: input.appId,
              reportId: input.reportId,
              objectApiName: input.objectApiName,
              pageSize: input.pageSize,
              totalSize,
              resolvedSoql: input.resolvedSoql,
              baseWhere: input.baseWhere,
              finalWhere: input.finalWhere,
              queryFingerprint
            },
            {
              sourceLocator: rawQueryResult.nextRecordsUrl,
              sourceRecords: remainingRecords
            }
          )
        : null;

    return {
      records: pageRecords,
      totalSize,
      nextCursor
    };
  }

  extractRecords(result: unknown): { records: Array<Record<string, unknown>>; totalSize: number } {
    if (!this.isObjectRecord(result)) {
      return { records: [], totalSize: 0 };
    }

    const rawRecords = result.records;
    const records = Array.isArray(rawRecords)
      ? rawRecords.filter((record): record is Record<string, unknown> => this.isObjectRecord(record))
      : [];
    const totalSize = typeof result.totalSize === 'number' ? result.totalSize : records.length;

    return { records, totalSize };
  }

  private async materializeCursorPage(params: {
    input: ReportCursorExecutionInput;
    sourceLocator?: string;
    sourceRecords: Array<Record<string, unknown>>;
    totalSize: number;
    queryFingerprint: string;
  }): Promise<{ records: Array<Record<string, unknown>>; totalSize: number; nextCursor: string | null }> {
    const workingRecords = [...params.sourceRecords];
    let locator = params.sourceLocator;

    while (workingRecords.length < params.input.pageSize && locator) {
      const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryMoreWithAudit({
        contactId: params.input.user.sub,
        queryKind: 'REPORT_RUN',
        targetId: params.input.reportId,
        objectApiName: params.input.objectApiName,
        resolvedSoql: params.input.resolvedSoql,
        visibility: params.input.visibility,
        baseWhere: params.input.baseWhere,
        finalWhere: params.input.finalWhere,
        locator,
        pageSize: params.input.pageSize,
        metadata: {
          appId: params.input.appId,
          reportId: params.input.reportId,
          paginationMode: 'cursor',
          cursorPhase: 'continue',
          selectedFields: params.input.selectedFields
        }
      });
      const { records } = this.extractRecords(rawQueryResult);
      workingRecords.push(...records);
      locator = rawQueryResult.nextRecordsUrl;
    }

    const pageRecords = workingRecords.slice(0, params.input.pageSize);
    const remainingRecords = workingRecords.slice(params.input.pageSize);
    const nextCursor =
      remainingRecords.length > 0 || locator
        ? await this.reportQueryCursorService.createCursor(
            {
              contactId: params.input.user.sub,
              appId: params.input.appId,
              reportId: params.input.reportId,
              objectApiName: params.input.objectApiName,
              pageSize: params.input.pageSize,
              totalSize: params.totalSize,
              resolvedSoql: params.input.resolvedSoql,
              baseWhere: params.input.baseWhere,
              finalWhere: params.input.finalWhere,
              queryFingerprint: params.queryFingerprint
            },
            {
              sourceLocator: locator,
              sourceRecords: remainingRecords
            }
          )
        : null;

    return {
      records: pageRecords,
      totalSize: params.totalSize,
      nextCursor
    };
  }

  private buildQueryFingerprint(input: ReportCursorExecutionInput): string {
    return this.reportQueryCursorService.hashFingerprint([
      input.user.sub,
      input.appId,
      input.reportId,
      input.pageSize,
      input.objectApiName,
      input.resolvedSoql,
      input.baseWhere,
      input.finalWhere,
      input.visibility.permissionsHash,
      input.visibility.policyVersion,
      input.visibility.objectPolicyVersion,
      input.visibility.compiledPredicate,
      (input.visibility.compiledFields ?? []).join(','),
      input.selectedFields.join(',')
    ]);
  }

  private assertCursorMatches(
    cursor: Awaited<ReturnType<ReportQueryCursorService['readCursor']>>,
    input: ReportCursorExecutionInput,
    queryFingerprint: string
  ): void {
    if (
      cursor.contactId !== input.user.sub ||
      cursor.appId !== input.appId ||
      cursor.reportId !== input.reportId ||
      cursor.pageSize !== input.pageSize ||
      cursor.objectApiName !== input.objectApiName ||
      cursor.queryFingerprint !== queryFingerprint
    ) {
      throw new BadRequestException('Invalid or expired report cursor');
    }
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
