import { BadRequestException, Injectable } from '@nestjs/common';

import { SalesforceService } from '../../salesforce/salesforce.service';
import type {
  VisibilityDebugContactSuggestion,
  VisibilityDebugPreviewResponse,
  VisibilityDebugPreviewScalar,
  VisibilityDebugPreviewSkipReason,
} from '../visibility-admin.types';
import { VisibilityService } from '../visibility.service';
import type { VisibilityEvaluation } from '../visibility.types';
import { VisibilityAdminInputNormalizerService } from './visibility-admin-input-normalizer.service';

@Injectable()
export class VisibilityAdminDebugPreviewService {
  constructor(
    private readonly visibilityService: VisibilityService,
    private readonly salesforceService: SalesforceService,
    private readonly inputNormalizer: VisibilityAdminInputNormalizerService,
  ) {}

  async searchDebugContacts(
    query: string,
    limit: number | undefined,
  ): Promise<{ items: VisibilityDebugContactSuggestion[] }> {
    const normalizedQuery = this.inputNormalizer.requireString(query, 'q is required');
    if (normalizedQuery.length < 2) {
      throw new BadRequestException('q must be at least 2 characters');
    }

    if (normalizedQuery.length > 80) {
      throw new BadRequestException('q must be at most 80 characters');
    }

    const items = await this.salesforceService.searchContactsByIdOrName(
      normalizedQuery,
      this.inputNormalizer.normalizeDebugContactSuggestionLimit(limit),
    );

    return {
      items,
    };
  }

  async evaluateDebug(payload: {
    objectApiName: string;
    contactId: string;
    permissions: string[];
    recordType?: string;
    baseWhere?: string;
    requestedFields?: string[];
  }): Promise<VisibilityEvaluation> {
    const objectApiName = this.inputNormalizer.requireString(
      payload.objectApiName,
      'objectApiName is required',
    );
    const contactId = this.inputNormalizer.normalizeOptionalContactId(payload.contactId, 'contactId');
    if (!contactId) {
      throw new BadRequestException('contactId is required');
    }

    return this.visibilityService.evaluate({
      objectApiName,
      contactId,
      permissions: this.inputNormalizer.normalizePermissionsArray(payload.permissions),
      contactRecordTypeDeveloperName: this.inputNormalizer.asOptionalString(payload.recordType),
      baseWhere: this.inputNormalizer.asOptionalString(payload.baseWhere),
      requestedFields: this.inputNormalizer.normalizeRequestedFields(payload.requestedFields),
      skipCache: true,
    });
  }

  async previewDebug(payload: {
    objectApiName: string;
    contactId: string;
    permissions: string[];
    recordType?: string;
    baseWhere?: string;
    requestedFields: string[];
    limit?: number;
  }): Promise<VisibilityDebugPreviewResponse> {
    const objectApiName = this.inputNormalizer.normalizePreviewObjectApiName(
      this.inputNormalizer.requireString(payload.objectApiName, 'objectApiName is required'),
      'objectApiName',
    );
    const contactId = this.inputNormalizer.normalizeOptionalContactId(payload.contactId, 'contactId');
    if (!contactId) {
      throw new BadRequestException('contactId is required');
    }

    const requestedFields = this.inputNormalizer.normalizeRequiredRequestedFields(payload.requestedFields);
    const evaluation = await this.visibilityService.evaluate({
      objectApiName,
      contactId,
      permissions: this.inputNormalizer.normalizePermissionsArray(payload.permissions),
      contactRecordTypeDeveloperName: this.inputNormalizer.asOptionalString(payload.recordType),
      baseWhere: this.inputNormalizer.asOptionalString(payload.baseWhere),
      requestedFields,
      skipCache: true,
    });
    const selectedFields = this.visibilityService.applyFieldVisibility(requestedFields, evaluation);

    if (evaluation.decision === 'DENY') {
      return this.buildPreviewSkippedResponse(evaluation, selectedFields, 'VISIBILITY_DENY');
    }

    if (selectedFields.length === 0) {
      return this.buildPreviewSkippedResponse(evaluation, selectedFields, 'NO_VISIBLE_FIELDS');
    }

    const limit = this.inputNormalizer.normalizePreviewLimit(payload.limit);
    const soql = this.buildPreviewSoql(objectApiName, selectedFields, evaluation.finalWhere, limit);
    const startedAt = Date.now();
    const rawResult = await this.salesforceService.executeReadOnlyQuery(soql);
    const records = this.extractPreviewRecords(rawResult, selectedFields);
    const rowCount = records.length;
    const visibility = {
      ...evaluation,
      rowCount,
    };

    await this.visibilityService.recordAudit({
      evaluation: visibility,
      queryKind: 'VISIBILITY_DEBUG_PREVIEW',
      baseWhere: evaluation.baseWhere,
      finalWhere: evaluation.finalWhere,
      rowCount,
      durationMs: Date.now() - startedAt,
    });

    return {
      visibility,
      selectedFields,
      soql,
      records,
      rowCount,
      executed: true,
    };
  }

  private async buildPreviewSkippedResponse(
    evaluation: VisibilityEvaluation,
    selectedFields: string[],
    reason: VisibilityDebugPreviewSkipReason,
  ): Promise<VisibilityDebugPreviewResponse> {
    const visibility = {
      ...evaluation,
      rowCount: 0,
    };

    await this.visibilityService.recordAudit({
      evaluation: visibility,
      queryKind: 'VISIBILITY_DEBUG_PREVIEW',
      baseWhere: evaluation.baseWhere,
      finalWhere: evaluation.finalWhere,
      rowCount: 0,
      durationMs: 0,
    });

    return {
      visibility,
      selectedFields,
      records: [],
      rowCount: 0,
      executed: false,
      executionSkippedReason: reason,
    };
  }

  private buildPreviewSoql(
    objectApiName: string,
    selectedFields: string[],
    finalWhere: string | undefined,
    limit: number,
  ): string {
    const whereClause = finalWhere?.trim() ? ` WHERE ${finalWhere.trim()}` : '';
    return `SELECT ${selectedFields.join(', ')} FROM ${objectApiName}${whereClause} ORDER BY Id ASC LIMIT ${limit}`;
  }

  private extractPreviewRecords(
    result: unknown,
    selectedFields: string[],
  ): Array<Record<string, VisibilityDebugPreviewScalar>> {
    if (!this.isObjectRecord(result) || !Array.isArray(result.records)) {
      return [];
    }

    return result.records
      .filter((record): record is Record<string, unknown> => this.isObjectRecord(record))
      .map((record) => {
        const flattened: Record<string, VisibilityDebugPreviewScalar> = {};

        for (const fieldName of selectedFields) {
          flattened[fieldName] = this.normalizePreviewScalar(
            this.resolvePreviewRecordValue(record, fieldName),
          );
        }

        return flattened;
      });
  }

  private resolvePreviewRecordValue(record: Record<string, unknown>, fieldPath: string): unknown {
    const segments = fieldPath
      .split('.')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    let current: unknown = record;

    for (const segment of segments) {
      if (!this.isObjectRecord(current)) {
        return undefined;
      }

      current = current[segment];
    }

    return current;
  }

  private normalizePreviewScalar(value: unknown): VisibilityDebugPreviewScalar {
    if (value === undefined || value === null) {
      return null;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'bigint') {
      return String(value);
    }

    return null;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
