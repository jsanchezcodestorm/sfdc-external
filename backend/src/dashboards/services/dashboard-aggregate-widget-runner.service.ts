import { Injectable } from '@nestjs/common';

import { QueryAuditService } from '../../audit/query-audit.service';
import type { SessionUser } from '../../auth/session-user.interface';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import type { ReportFilter } from '../../reports/reports.types';
import { ReportSoqlBuilderService } from '../../reports/services/report-soql-builder.service';
import { MAX_WIDGET_LIMIT } from '../dashboard-runtime.constants';
import type {
  DashboardChartWidgetDefinition,
  DashboardDefinition,
  DashboardKpiWidgetDefinition,
  DashboardRunChartWidget,
  DashboardRunKpiWidget,
  DashboardRunTableGroupedWidget,
  DashboardRuntimeReportContext,
  DashboardTableGroupedWidgetDefinition
} from '../dashboards.types';
import { DashboardValueService } from './dashboard-value.service';

@Injectable()
export class DashboardAggregateWidgetRunnerService {
  constructor(
    private readonly queryAuditService: QueryAuditService,
    private readonly reportSoqlBuilderService: ReportSoqlBuilderService,
    private readonly valueService: DashboardValueService
  ) {}

  async runKpiWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    runtimeFilters: ReportFilter[],
    widget: DashboardKpiWidgetDefinition
  ): Promise<DashboardRunKpiWidget> {
    const compiled = this.reportSoqlBuilderService.buildAggregateQuery(
      sourceReportContext,
      visibility,
      {
        metricOperation: widget.metric.operation,
        metricField: widget.metric.field,
        runtimeFilters
      }
    );
    const rawResult = await this.executeWidgetQuery(user, appId, dashboard, sourceReportContext.objectApiName, visibility, compiled, widget.id, widget.type);
    const records = this.valueService.extractRecords(rawResult);
    const metricRecord = records[0];

    return {
      id: widget.id,
      type: 'kpi',
      title: widget.title,
      metric: widget.metric,
      value: metricRecord ? this.valueService.toSafeNumber(metricRecord.metricValue) : 0
    };
  }

  async runChartWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    runtimeFilters: ReportFilter[],
    widget: DashboardChartWidgetDefinition
  ): Promise<DashboardRunChartWidget> {
    const compiled = this.reportSoqlBuilderService.buildAggregateQuery(
      sourceReportContext,
      visibility,
      {
        dimensionField: widget.dimensionField,
        metricOperation: widget.metric.operation,
        metricField: widget.metric.field,
        runtimeFilters,
        limit: widget.limit ?? MAX_WIDGET_LIMIT,
        sortDirection: widget.sortDirection
      }
    );
    const rawResult = await this.executeWidgetQuery(user, appId, dashboard, sourceReportContext.objectApiName, visibility, compiled, widget.id, widget.type);
    const records = this.valueService.extractRecords(rawResult);

    return {
      id: widget.id,
      type: 'chart',
      title: widget.title,
      chartType: widget.chartType,
      metric: widget.metric,
      dimensionField: widget.dimensionField,
      points: records.map((record) => {
        const rawValue = this.valueService.toScalarValue(record[widget.dimensionField]);
        return {
          key: this.valueService.buildScalarKey(rawValue),
          label: this.valueService.stringifyScalarValue(rawValue),
          rawValue,
          value: this.valueService.toSafeNumber(record.metricValue)
        };
      })
    };
  }

  async runGroupedTableWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    runtimeFilters: ReportFilter[],
    widget: DashboardTableGroupedWidgetDefinition
  ): Promise<DashboardRunTableGroupedWidget> {
    const compiled = this.reportSoqlBuilderService.buildAggregateQuery(
      sourceReportContext,
      visibility,
      {
        dimensionField: widget.dimensionField,
        metricOperation: widget.metric.operation,
        metricField: widget.metric.field,
        runtimeFilters,
        limit: widget.limit ?? MAX_WIDGET_LIMIT,
        sortDirection: widget.sortDirection
      }
    );
    const rawResult = await this.executeWidgetQuery(user, appId, dashboard, sourceReportContext.objectApiName, visibility, compiled, widget.id, widget.type);
    const records = this.valueService.extractRecords(rawResult);

    return {
      id: widget.id,
      type: 'table',
      displayMode: 'grouped',
      title: widget.title,
      metric: widget.metric,
      dimensionField: widget.dimensionField,
      rows: records.map((record) => {
        const rawValue = this.valueService.toScalarValue(record[widget.dimensionField]);
        return {
          key: this.valueService.buildScalarKey(rawValue),
          label: this.valueService.stringifyScalarValue(rawValue),
          rawValue,
          metricValue: this.valueService.toSafeNumber(record.metricValue)
        };
      })
    };
  }

  private executeWidgetQuery(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    objectApiName: string,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    compiled: { soql: string; baseWhere?: string; finalWhere?: string },
    widgetId: string,
    widgetType: string
  ): Promise<unknown> {
    return this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'DASHBOARD_RUN',
      targetId: `${dashboard.id}:${widgetId}`,
      objectApiName,
      resolvedSoql: compiled.soql,
      visibility,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      metadata: {
        appId,
        dashboardId: dashboard.id,
        widgetId,
        widgetType
      }
    });
  }
}
