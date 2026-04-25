import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../../auth/session-user.interface';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import type {
  DashboardAppliedFilter,
  DashboardDefinition,
  DashboardRunWidget,
  DashboardRuntimeReportContext,
  DashboardWidgetDefinition
} from '../dashboards.types';
import { DashboardAggregateWidgetRunnerService } from './dashboard-aggregate-widget-runner.service';
import { DashboardRowsWidgetRunnerService } from './dashboard-rows-widget-runner.service';
import { DashboardValueService } from './dashboard-value.service';

@Injectable()
export class DashboardWidgetRunnerService {
  constructor(
    private readonly aggregateWidgetRunner: DashboardAggregateWidgetRunnerService,
    private readonly rowsWidgetRunner: DashboardRowsWidgetRunnerService,
    private readonly valueService: DashboardValueService
  ) {}

  async runWidgets(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    appliedFilters: DashboardAppliedFilter[]
  ): Promise<DashboardRunWidget[]> {
    const widgetResults: DashboardRunWidget[] = [];
    for (const widget of dashboard.widgets) {
      widgetResults.push(
        await this.runWidget(user, appId, dashboard, sourceReportContext, visibility, appliedFilters, widget)
      );
    }

    return widgetResults;
  }

  private runWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    appliedFilters: DashboardAppliedFilter[],
    widget: DashboardWidgetDefinition
  ): Promise<DashboardRunWidget> {
    const runtimeFilters = appliedFilters.map((entry) => this.valueService.toEqualityReportFilter(entry));

    switch (widget.type) {
      case 'kpi':
        return this.aggregateWidgetRunner.runKpiWidget(user, appId, dashboard, sourceReportContext, visibility, runtimeFilters, widget);
      case 'chart':
        return this.aggregateWidgetRunner.runChartWidget(user, appId, dashboard, sourceReportContext, visibility, runtimeFilters, widget);
      case 'table':
        if (widget.displayMode === 'grouped') {
          return this.aggregateWidgetRunner.runGroupedTableWidget(user, appId, dashboard, sourceReportContext, visibility, runtimeFilters, widget);
        }
        return this.rowsWidgetRunner.runRowsTableWidget(user, appId, dashboard, sourceReportContext, visibility, runtimeFilters, widget);
    }
  }
}
