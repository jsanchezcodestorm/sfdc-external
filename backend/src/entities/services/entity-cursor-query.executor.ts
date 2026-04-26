import type { QueryAuditService } from '../../audit/query-audit.service';

import type {
  EntityCursorExecutionInput,
  EntityCursorExecutionResult
} from '../entities.runtime.types';

import type {
  EntityQueryCursorRecord,
  EntityQueryCursorScope,
  EntityQueryCursorService
} from './entity-query-cursor.service';

interface EntityCursorQueryExecutorHooks {
  assertCursorMatches(
    cursor: EntityQueryCursorRecord,
    input: EntityCursorExecutionInput & { queryFingerprint: string }
  ): void;
  buildCursorScope(
    input: EntityCursorExecutionInput,
    queryFingerprint: string,
    totalSize: number
  ): EntityQueryCursorScope;
  buildQueryFingerprint(input: EntityCursorExecutionInput): string;
  extractRecords(result: unknown): { records: Array<Record<string, unknown>>; totalSize: number };
}

export class EntityCursorQueryExecutor {
  constructor(
    private readonly queryAuditService: QueryAuditService,
    private readonly entityQueryCursorService: EntityQueryCursorService,
    private readonly hooks: EntityCursorQueryExecutorHooks
  ) {}

  async execute(input: EntityCursorExecutionInput): Promise<EntityCursorExecutionResult> {
    const queryFingerprint = this.hooks.buildQueryFingerprint(input);

    if (input.cursor) {
      const cursor = await this.entityQueryCursorService.readCursor(input.cursor);
      this.hooks.assertCursorMatches(cursor, {
        ...input,
        queryFingerprint
      });

      return this.materializeCursorPage({
        input,
        sourceLocator: cursor.sourceLocator,
        sourceRecords: cursor.sourceRecords,
        queryFingerprint,
        totalSize: cursor.totalSize
      });
    }

    const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryPageWithAudit({
      contactId: input.user.sub,
      queryKind: input.queryKind,
      targetId: input.entityId,
      objectApiName: input.objectApiName,
      resolvedSoql: input.resolvedSoql,
      visibility: input.visibility,
      recordId: input.recordId,
      baseWhere: input.baseWhere,
      finalWhere: input.finalWhere,
      pageSize: input.pageSize,
      metadata: {
        ...input.metadata,
        paginationMode: 'cursor',
        cursorPhase: 'initial'
      }
    });
    const { records, totalSize } = this.hooks.extractRecords(rawQueryResult);
    const pageRecords = records.slice(0, input.pageSize);
    const remainingRecords = records.slice(input.pageSize);
    const nextCursor =
      remainingRecords.length > 0 || rawQueryResult.nextRecordsUrl
        ? await this.entityQueryCursorService.createCursor(
            this.hooks.buildCursorScope(input, queryFingerprint, totalSize),
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

  private async materializeCursorPage(params: {
    input: EntityCursorExecutionInput;
    sourceLocator?: string;
    sourceRecords: Array<Record<string, unknown>>;
    queryFingerprint: string;
    totalSize: number;
  }): Promise<EntityCursorExecutionResult> {
    const workingRecords = [...params.sourceRecords];
    let locator = params.sourceLocator;

    while (workingRecords.length < params.input.pageSize && locator) {
      const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryMoreWithAudit({
        contactId: params.input.user.sub,
        queryKind: params.input.queryKind,
        targetId: params.input.entityId,
        objectApiName: params.input.objectApiName,
        resolvedSoql: params.input.resolvedSoql,
        visibility: params.input.visibility,
        recordId: params.input.recordId,
        baseWhere: params.input.baseWhere,
        finalWhere: params.input.finalWhere,
        locator,
        pageSize: params.input.pageSize,
        metadata: {
          ...params.input.metadata,
          paginationMode: 'cursor',
          cursorPhase: 'continue'
        }
      });
      const { records } = this.hooks.extractRecords(rawQueryResult);
      workingRecords.push(...records);
      locator = rawQueryResult.nextRecordsUrl;
    }

    const pageRecords = workingRecords.slice(0, params.input.pageSize);
    const remainingRecords = workingRecords.slice(params.input.pageSize);
    const nextCursor =
      remainingRecords.length > 0 || locator
        ? await this.entityQueryCursorService.createCursor(
            this.hooks.buildCursorScope(params.input, params.queryFingerprint, params.totalSize),
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
}
