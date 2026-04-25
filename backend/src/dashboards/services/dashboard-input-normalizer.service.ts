import { BadRequestException, Injectable } from '@nestjs/common';

import type { ReportShareGrant } from '../../reports/reports.types';
import {
  MAX_DASHBOARD_FILTERS,
  SALESFORCE_ID_PATTERN
} from '../dashboard-runtime.constants';
import type { DashboardRecordWithRelations } from '../dashboard-records.types';
import type {
  DashboardAppliedFilter,
  DashboardFilterDefinition,
  UpsertDashboardDefinitionInput,
  UpsertDashboardFolderInput
} from '../dashboards.types';
import { DashboardShareCodecService } from './dashboard-share-codec.service';
import { DashboardValueService } from './dashboard-value.service';
import { DashboardWidgetInputNormalizerService } from './dashboard-widget-input-normalizer.service';

@Injectable()
export class DashboardInputNormalizerService {
  constructor(
    private readonly shareCodec: DashboardShareCodecService,
    private readonly valueService: DashboardValueService,
    private readonly widgetInputNormalizer: DashboardWidgetInputNormalizerService
  ) {}

  normalizeFolderInput(value: unknown): UpsertDashboardFolderInput {
    const payload = this.valueService.requireObject(value, 'folder payload must be an object');
    const label = this.valueService.requireString(payload.label, 'folder.label is required');
    const accessMode = this.shareCodec.normalizeFolderAccessMode(this.valueService.asOptionalString(payload.accessMode));
    const shares = this.normalizeShareGrants(Array.isArray(payload.shares) ? payload.shares : [], 'folder.shares');

    if (accessMode === 'personal' && shares.length > 0) {
      throw new BadRequestException('Personal folder does not accept share grants');
    }

    if (accessMode === 'shared' && shares.length === 0) {
      throw new BadRequestException('Shared folder requires at least one share grant');
    }

    return {
      label,
      description: this.valueService.asOptionalString(payload.description),
      accessMode,
      shares
    };
  }

  normalizeDashboardInput(
    value: unknown,
    existing?: Pick<DashboardRecordWithRelations, 'sourceReportId'>
  ): UpsertDashboardDefinitionInput {
    const payload = this.valueService.requireObject(value, 'dashboard payload must be an object');
    const folderId = this.valueService.requireUuidString(payload.folderId, 'dashboard.folderId');
    const label = this.valueService.requireString(payload.label, 'dashboard.label is required');
    const sourceReportId = this.normalizeSourceReportId(payload.sourceReportId, existing?.sourceReportId);
    const filters = this.normalizeDashboardFilters(payload.filters);
    const widgets = this.widgetInputNormalizer.normalizeDashboardWidgets(payload.widgets);
    const shareMode = this.shareCodec.normalizeShareMode(this.valueService.asOptionalString(payload.shareMode));
    const shares = this.normalizeShareGrants(Array.isArray(payload.shares) ? payload.shares : [], 'dashboard.shares');

    if ((shareMode === 'inherit' || shareMode === 'personal') && shares.length > 0) {
      throw new BadRequestException(`Dashboard shareMode ${shareMode} does not accept explicit share grants`);
    }

    if (shareMode === 'restricted' && shares.length === 0) {
      throw new BadRequestException('Restricted dashboard requires at least one share grant');
    }

    return {
      folderId,
      sourceReportId,
      label,
      description: this.valueService.asOptionalString(payload.description),
      filters,
      widgets,
      shareMode,
      shares
    };
  }

  normalizeSourceReportId(value: unknown, existingSourceReportId: string | undefined): string {
    if (existingSourceReportId) {
      const nextValue = this.valueService.asOptionalString(value);
      if (!nextValue) {
        return existingSourceReportId;
      }

      if (nextValue !== existingSourceReportId) {
        throw new BadRequestException('dashboard.sourceReportId cannot change after creation');
      }

      return existingSourceReportId;
    }

    return this.valueService.requireUuidString(value, 'dashboard.sourceReportId');
  }

  normalizeDashboardFilters(value: unknown): DashboardFilterDefinition[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('dashboard.filters must be an array');
    }

    if (value.length > MAX_DASHBOARD_FILTERS) {
      throw new BadRequestException(`dashboard.filters supports at most ${MAX_DASHBOARD_FILTERS} filters`);
    }

    const filters = value.map((entry, index) => {
      const filter = this.valueService.requireObject(entry, `dashboard.filters[${index}] must be an object`);
      return {
        field: this.valueService.requireString(filter.field, `dashboard.filters[${index}].field is required`),
        label: this.valueService.asOptionalString(filter.label)
      } satisfies DashboardFilterDefinition;
    });

    this.valueService.assertUniqueFieldSequence(filters.map((filter) => filter.field), 'dashboard.filters');
    return filters;
  }

  normalizeShareGrants(value: unknown[], fieldName: string): ReportShareGrant[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} must be an array`);
    }

    const shares = value.map((entry, index) => {
      const share = this.valueService.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const subjectType = this.valueService.requireString(share.subjectType, `${fieldName}[${index}].subjectType is required`);
      const normalizedType = this.shareCodec.normalizeShareSubjectType(subjectType, `${fieldName}[${index}].subjectType`);
      const subjectId = this.valueService.requireString(share.subjectId, `${fieldName}[${index}].subjectId is required`);

      if (normalizedType === 'contact' && !SALESFORCE_ID_PATTERN.test(subjectId)) {
        throw new BadRequestException(`${fieldName}[${index}].subjectId must be a valid Salesforce Contact id`);
      }

      return {
        subjectType: normalizedType,
        subjectId
      } satisfies ReportShareGrant;
    });

    const uniqueKeys = new Set(shares.map((share) => this.shareCodec.buildShareGrantKey(share)));
    if (uniqueKeys.size !== shares.length) {
      throw new BadRequestException(`${fieldName} must not contain duplicates`);
    }

    return shares;
  }

  normalizeRuntimeFilters(value: unknown[], allowedFilters: DashboardFilterDefinition[]): DashboardAppliedFilter[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('filters must be an array');
    }

    const allowedFields = new Set(allowedFilters.map((filter) => filter.field));
    const applied = value.map((entry, index) => {
      const filter = this.valueService.requireObject(entry, `filters[${index}] must be an object`);
      const field = this.valueService.requireString(filter.field, `filters[${index}].field is required`);
      if (!allowedFields.has(field)) {
        throw new BadRequestException(`filters[${index}].field is not configured on this dashboard`);
      }

      return {
        field,
        value: this.valueService.normalizeScalarValue(filter.value, `filters[${index}].value`)
      };
    });

    this.valueService.assertUniqueFieldSequence(applied.map((filter) => filter.field), 'filters');
    return applied;
  }
}
