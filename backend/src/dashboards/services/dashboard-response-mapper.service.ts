import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../../auth/session-user.interface';
import type {
  DashboardFolderRecordWithRelations,
  DashboardRecordWithRelations
} from '../dashboard-records.types';
import type {
  DashboardDefinition,
  DashboardFolderSummary,
  DashboardSummary
} from '../dashboards.types';
import { DashboardAccessPolicyService } from './dashboard-access-policy.service';
import { DashboardDefinitionReaderService } from './dashboard-definition-reader.service';
import { DashboardShareCodecService } from './dashboard-share-codec.service';

@Injectable()
export class DashboardResponseMapperService {
  constructor(
    private readonly accessPolicy: DashboardAccessPolicyService,
    private readonly definitionReader: DashboardDefinitionReaderService,
    private readonly shareCodec: DashboardShareCodecService
  ) {}

  mapFolderSummary(user: SessionUser, folder: DashboardFolderRecordWithRelations): DashboardFolderSummary {
    return {
      id: folder.id,
      appId: folder.appId,
      label: folder.label,
      description: folder.description ?? undefined,
      ownerContactId: folder.ownerContactId,
      accessMode: this.shareCodec.fromFolderAccessMode(folder.accessMode),
      shares: folder.shares.map((share) => this.shareCodec.mapShareGrant(share)),
      dashboardCount: folder.dashboards.filter((dashboard) =>
        this.accessPolicy.canAccessDashboard(user, folder, dashboard)
      ).length,
      canEdit: this.accessPolicy.canManageDashboardFolder(user, folder, false),
      canShare: this.accessPolicy.canManageDashboardFolder(user, folder, false),
      updatedAt: folder.updatedAt.toISOString()
    };
  }

  mapDashboardSummary(
    user: SessionUser,
    dashboard: DashboardFolderRecordWithRelations['dashboards'][number] | DashboardRecordWithRelations
  ): DashboardSummary {
    const widgets = this.definitionReader.readDashboardWidgets(
      dashboard.widgetsJson,
      dashboard.layoutJson,
      `dashboard ${dashboard.id}.widgets`
    );
    const filters = this.definitionReader.readDashboardFilters(dashboard.filtersJson, `dashboard ${dashboard.id}.filters`);

    return {
      id: dashboard.id,
      appId: dashboard.appId,
      folderId: dashboard.folderId,
      sourceReportId: dashboard.sourceReportId,
      sourceReportLabel: dashboard.sourceReport.label,
      sourceObjectApiName: dashboard.sourceReport.objectApiName,
      label: dashboard.label,
      description: dashboard.description ?? undefined,
      ownerContactId: dashboard.ownerContactId,
      shareMode: this.shareCodec.fromShareMode(dashboard.shareMode),
      filterCount: filters.length,
      widgetCount: widgets.length,
      canEdit: this.accessPolicy.canManageDashboard(user, dashboard, false),
      canShare: this.accessPolicy.canManageDashboard(user, dashboard, false),
      updatedAt: dashboard.updatedAt.toISOString()
    };
  }

  mapDashboardDefinition(user: SessionUser, dashboard: DashboardRecordWithRelations): DashboardDefinition {
    return {
      ...this.mapDashboardSummary(user, dashboard),
      filters: this.definitionReader.readDashboardFilters(dashboard.filtersJson, `dashboard ${dashboard.id}.filters`),
      widgets: this.definitionReader.readDashboardWidgets(dashboard.widgetsJson, dashboard.layoutJson, `dashboard ${dashboard.id}.widgets`),
      shares: dashboard.shares.map((share) => this.shareCodec.mapShareGrant(share))
    };
  }
}
