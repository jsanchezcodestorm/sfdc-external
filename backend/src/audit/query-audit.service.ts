import { Injectable } from '@nestjs/common';

import { SalesforceService } from '../salesforce/salesforce.service';
import { VisibilityService } from '../visibility/visibility.service';
import type { VisibilityEvaluation } from '../visibility/visibility.types';

import { AuditWriteService } from './audit-write.service';

export interface ExecuteAuditedQueryInput {
  contactId: string;
  queryKind: string;
  targetId: string;
  objectApiName: string;
  resolvedSoql: string;
  visibility: VisibilityEvaluation;
  recordId?: string;
  baseWhere?: string;
  finalWhere?: string;
  metadata?: unknown;
}

@Injectable()
export class QueryAuditService {
  constructor(
    private readonly auditWriteService: AuditWriteService,
    private readonly salesforceService: SalesforceService,
    private readonly visibilityService: VisibilityService,
  ) {}

  async executeReadOnlyQueryWithAudit(input: ExecuteAuditedQueryInput): Promise<unknown> {
    const auditId = await this.auditWriteService.createQueryAuditIntentOrThrow({
      contactId: input.contactId,
      queryKind: input.queryKind,
      targetId: input.targetId,
      objectApiName: input.objectApiName,
      recordId: input.recordId,
      resolvedSoql: input.resolvedSoql,
      baseWhere: input.baseWhere,
      finalWhere: input.finalWhere,
      metadata: input.metadata,
    });

    const startedAt = Date.now();

    try {
      const result = await this.salesforceService.executeReadOnlyQuery(input.resolvedSoql);
      const durationMs = Date.now() - startedAt;
      const resultSummary = this.buildResultSummary(result);
      await this.auditWriteService.completeQueryAuditOrThrow({
        auditId,
        status: 'SUCCESS',
        rowCount: resultSummary.returnedRows,
        durationMs,
        result: resultSummary.payload,
      });
      await this.visibilityService.recordAudit({
        evaluation: input.visibility,
        queryKind: input.queryKind,
        baseWhere: input.baseWhere,
        finalWhere: input.finalWhere,
        rowCount: resultSummary.returnedRows,
        durationMs,
      });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await this.auditWriteService.completeQueryAuditOrThrow({
        auditId,
        status: 'FAILURE',
        rowCount: 0,
        durationMs,
        errorCode: this.auditWriteService.normalizeErrorCode(error),
        result: {
          message: error instanceof Error ? error.message : 'unknown error',
        },
      });
      await this.visibilityService.recordAudit({
        evaluation: input.visibility,
        queryKind: input.queryKind,
        baseWhere: input.baseWhere,
        finalWhere: input.finalWhere,
        rowCount: 0,
        durationMs,
      });
      throw error;
    }
  }

  private buildResultSummary(result: unknown): {
    returnedRows: number;
    payload: Record<string, boolean | number>;
  } {
    const records =
      typeof result === 'object' &&
      result !== null &&
      Array.isArray((result as { records?: unknown[] }).records)
        ? ((result as { records?: unknown[] }).records ?? [])
        : [];
    const totalSize =
      typeof result === 'object' &&
      result !== null &&
      typeof (result as { totalSize?: unknown }).totalSize === 'number'
        ? (result as { totalSize: number }).totalSize
        : undefined;
    const done =
      typeof result === 'object' &&
      result !== null &&
      typeof (result as { done?: unknown }).done === 'boolean'
        ? (result as { done: boolean }).done
        : undefined;

    const payload: Record<string, boolean | number> = {
      returnedRows: records.length,
    };

    if (typeof totalSize === 'number') {
      payload.totalSize = totalSize;
    }

    if (typeof done === 'boolean') {
      payload.done = done;
    }

    return {
      returnedRows: records.length,
      payload,
    };
  }
}
