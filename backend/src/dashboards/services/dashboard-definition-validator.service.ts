import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportFolderAccessMode, ReportShareMode } from '@prisma/client';

import type { SessionUser } from '../../auth/session-user.interface';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import type { ReportShareGrant } from '../../reports/reports.types';
import { ReportSoqlBuilderService } from '../../reports/services/report-soql-builder.service';
import { SalesforceService } from '../../salesforce/salesforce.service';
import { NUMERIC_FIELD_TYPES } from '../dashboard-runtime.constants';
import type {
  DashboardFieldMetadata,
  DashboardFolderRecordWithRelations,
  DashboardGrantEnvelope,
  DashboardShareRecordLike,
  SourceReportRecord
} from '../dashboard-records.types';
import type {
  DashboardMetricDefinition,
  DashboardWidgetDefinition,
  UpsertDashboardDefinitionInput,
  UpsertDashboardFolderInput
} from '../dashboards.types';
import { DashboardRecordsRepository } from './dashboard-records.repository';
import { DashboardShareCodecService } from './dashboard-share-codec.service';

@Injectable()
export class DashboardDefinitionValidatorService {
  constructor(
    private readonly dashboardRecordsRepository: DashboardRecordsRepository,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly salesforceService: SalesforceService,
    private readonly reportSoqlBuilderService: ReportSoqlBuilderService,
    private readonly shareCodec: DashboardShareCodecService
  ) {}

  async validateDashboardDefinition(
    user: SessionUser,
    sourceReport: SourceReportRecord,
    dashboard: UpsertDashboardDefinitionInput,
    folderId: string
  ): Promise<void> {
    const folder = await this.dashboardRecordsRepository.getFolderOrThrow(sourceReport.appId, folderId);
    this.assertDashboardSharesCompatibleWithSourceReport(folder, dashboard, sourceReport);

    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      'rest:dashboards-write',
      sourceReport.objectApiName,
      {
        queryKind: 'DASHBOARD_CONFIG'
      }
    );
    const visibleFieldMap = await this.buildVisibleFieldMetadataMap(sourceReport.objectApiName, visibility);

    for (const filter of dashboard.filters) {
      const field = visibleFieldMap.get(filter.field);
      if (!field) {
        throw new BadRequestException(`dashboard.filters field ${filter.field} is not visible on the source report object`);
      }
      if (!field.filterable) {
        throw new BadRequestException(`dashboard.filters field ${filter.field} is not filterable`);
      }
    }

    for (const widget of dashboard.widgets) {
      this.validateWidgetFields(widget, visibleFieldMap);
    }
  }

  async buildVisibleFieldMetadataMap(
    objectApiName: string,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>
  ): Promise<Map<string, DashboardFieldMetadata>> {
    const fields = await this.salesforceService.describeObjectFields(objectApiName.trim());
    const visibleFieldNames = new Set(
      this.reportSoqlBuilderService.filterVisibleFieldNames(
        fields.map((field) => field.name),
        visibility
      )
    );

    return new Map(
      fields
        .filter((field) => visibleFieldNames.has(field.name))
        .map((field) => [
          field.name,
          {
            name: field.name,
            label: field.label,
            type: field.type,
            filterable: field.filterable
          } satisfies DashboardFieldMetadata
        ])
    );
  }

  validateWidgetFields(widget: DashboardWidgetDefinition, fieldMap: Map<string, DashboardFieldMetadata>): void {
    switch (widget.type) {
      case 'kpi':
        this.validateMetricField(widget.metric, fieldMap, `${widget.type}:${widget.id}`);
        return;
      case 'chart':
        this.assertFieldVisible(widget.dimensionField, fieldMap, `chart:${widget.id}.dimensionField`);
        this.validateMetricField(widget.metric, fieldMap, `chart:${widget.id}.metric`);
        return;
      case 'table':
        if (widget.displayMode === 'grouped') {
          this.assertFieldVisible(widget.dimensionField, fieldMap, `table:${widget.id}.dimensionField`);
          this.validateMetricField(widget.metric, fieldMap, `table:${widget.id}.metric`);
          return;
        }

        for (const column of widget.columns) {
          this.assertFieldVisible(column.field, fieldMap, `table:${widget.id}.columns`);
        }
    }
  }

  assertFolderScopeCompatibleWithDashboards(
    folder: UpsertDashboardFolderInput,
    dashboards: DashboardFolderRecordWithRelations['dashboards']
  ): void {
    for (const dashboard of dashboards) {
      this.assertDashboardSharesCompatibleWithSourceReport(
        {
          accessMode: this.shareCodec.toFolderAccessMode(folder.accessMode),
          shares: folder.shares.map((share) => ({
            subjectType: this.shareCodec.toShareSubjectType(share.subjectType),
            subjectId: share.subjectId
          }))
        },
        {
          shareMode: this.shareCodec.fromShareMode(dashboard.shareMode),
          shares: dashboard.shares.map((share) => this.shareCodec.mapShareGrant(share))
        },
        dashboard.sourceReport
      );
    }
  }

  assertDashboardSharesCompatibleWithSourceReport(
    folder: { accessMode: ReportFolderAccessMode; shares: DashboardShareRecordLike[] },
    dashboard: Pick<UpsertDashboardDefinitionInput, 'shareMode' | 'shares'>,
    sourceReport: SourceReportRecord
  ): void {
    const grantEnvelope = this.buildSourceReportGrantEnvelope(sourceReport);
    this.assertGrantSubset(
      'Dashboard folder',
      this.shareCodec.fromFolderAccessMode(folder.accessMode),
      folder.shares.map((share) => this.shareCodec.mapShareGrant(share)),
      grantEnvelope
    );
    this.assertGrantSubset('Dashboard', dashboard.shareMode, dashboard.shares, grantEnvelope);
  }

  private validateMetricField(metric: DashboardMetricDefinition, fieldMap: Map<string, DashboardFieldMetadata>, path: string): void {
    if (metric.operation === 'COUNT') {
      return;
    }

    const field = fieldMap.get(metric.field ?? '');
    if (!field) {
      throw new BadRequestException(`${path}.field is not visible on the source report object`);
    }

    if (!NUMERIC_FIELD_TYPES.has(field.type.toLowerCase())) {
      throw new BadRequestException(`${path}.field must be numeric for ${metric.operation}`);
    }
  }

  private assertFieldVisible(fieldName: string, fieldMap: Map<string, DashboardFieldMetadata>, path: string): void {
    if (!fieldMap.has(fieldName)) {
      throw new BadRequestException(`${path} is not visible on the source report object`);
    }
  }

  private buildSourceReportGrantEnvelope(sourceReport: SourceReportRecord): DashboardGrantEnvelope {
    if (sourceReport.folder.accessMode === ReportFolderAccessMode.PERSONAL) {
      return { ownerOnly: true, allowedGrantKeys: new Set<string>() };
    }

    if (sourceReport.shareMode === ReportShareMode.PERSONAL) {
      return { ownerOnly: true, allowedGrantKeys: new Set<string>() };
    }

    const folderGrantKeys = new Set(
      sourceReport.folder.shares.map((share) =>
        this.shareCodec.buildShareGrantKey(this.shareCodec.mapShareGrant(share))
      )
    );

    if (sourceReport.shareMode === ReportShareMode.INHERIT) {
      return {
        ownerOnly: false,
        allowedGrantKeys: folderGrantKeys
      };
    }

    const reportGrantKeys = new Set(
      sourceReport.shares.map((share) => this.shareCodec.buildShareGrantKey(this.shareCodec.mapShareGrant(share)))
    );

    return {
      ownerOnly: false,
      allowedGrantKeys: new Set(
        [...folderGrantKeys].filter((key) => reportGrantKeys.has(key))
      )
    };
  }

  private assertGrantSubset(
    scopeLabel: string,
    mode: 'personal' | 'shared' | 'inherit' | 'restricted',
    shares: ReportShareGrant[],
    grantEnvelope: DashboardGrantEnvelope
  ): void {
    if (mode === 'personal' || mode === 'inherit') {
      return;
    }

    if (grantEnvelope.ownerOnly) {
      throw new BadRequestException(`${scopeLabel} cannot be shared beyond the source report access scope`);
    }

    for (const share of shares) {
      if (!grantEnvelope.allowedGrantKeys.has(this.shareCodec.buildShareGrantKey(share))) {
        throw new BadRequestException(`${scopeLabel} cannot be more permissive than the source report`);
      }
    }
  }
}
