import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../../auth/session-user.interface';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import type { DashboardRecordWithRelations } from '../dashboard-records.types';
import type {
  DashboardDefinition,
  DashboardRunResponse
} from '../dashboards.types';
import { DashboardDefinitionReaderService } from './dashboard-definition-reader.service';
import { DashboardInputNormalizerService } from './dashboard-input-normalizer.service';
import { DashboardRuntimeFilterService } from './dashboard-runtime-filter.service';
import { DashboardWidgetRunnerService } from './dashboard-widget-runner.service';

@Injectable()
export class DashboardRunnerService {
  constructor(
    private readonly resourceAccessService: ResourceAccessService,
    private readonly definitionReader: DashboardDefinitionReaderService,
    private readonly inputNormalizer: DashboardInputNormalizerService,
    private readonly runtimeFilterService: DashboardRuntimeFilterService,
    private readonly widgetRunner: DashboardWidgetRunnerService
  ) {}

  async runDashboard(
    user: SessionUser,
    appId: string,
    dashboardRecord: DashboardRecordWithRelations,
    dashboard: DashboardDefinition,
    payload: { filters?: unknown[] } | undefined
  ): Promise<DashboardRunResponse> {
    const sourceReportContext = this.definitionReader.readDashboardSourceReportContext(dashboardRecord.sourceReport);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      'rest:dashboards-read',
      sourceReportContext.objectApiName,
      {
        queryKind: 'DASHBOARD_RUN'
      }
    );

    const appliedFilters = this.inputNormalizer.normalizeRuntimeFilters(payload?.filters ?? [], dashboard.filters);
    const filterStates = await this.runtimeFilterService.loadFilterStates(
      user,
      appId,
      dashboard,
      sourceReportContext,
      visibility,
      appliedFilters
    );
    this.runtimeFilterService.assertAppliedFiltersAllowed(appliedFilters, filterStates);

    return {
      dashboard,
      availableFilters: filterStates,
      appliedFilters,
      widgets: await this.widgetRunner.runWidgets(
        user,
        appId,
        dashboard,
        sourceReportContext,
        visibility,
        appliedFilters
      )
    };
  }
}
