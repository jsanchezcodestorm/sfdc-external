import { Injectable } from '@nestjs/common';

import { QueryAuditService } from '../../audit/query-audit.service';
import type { SessionUser } from '../../auth/session-user.interface';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import type { ReportColumn, ReportFilter, ReportSort } from '../../reports/reports.types';
import { ReportSoqlBuilderService } from '../../reports/services/report-soql-builder.service';
import { MAX_WIDGET_LIMIT } from '../dashboard-runtime.constants';
import type {
  DashboardDefinition,
  DashboardRunTableRow,
  DashboardRunTableRowsWidget,
  DashboardRuntimeReportContext,
  DashboardTableRowsWidgetDefinition
} from '../dashboards.types';
import { DashboardValueService } from './dashboard-value.service';

@Injectable()
export class DashboardRowsWidgetRunnerService {
  constructor(
    private readonly queryAuditService: QueryAuditService,
    private readonly reportSoqlBuilderService: ReportSoqlBuilderService,
    private readonly valueService: DashboardValueService
  ) {}

  async runRowsTableWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    runtimeFilters: ReportFilter[],
    widget: DashboardTableRowsWidgetDefinition
  ): Promise<DashboardRunTableRowsWidget> {
    const compiled = this.reportSoqlBuilderService.buildRowsQuery(
      {
        objectApiName: sourceReportContext.objectApiName,
        filters: sourceReportContext.filters,
        sort: this.buildRowsWidgetSort(widget.columns)
      },
      visibility,
      {
        columns: widget.columns,
        runtimeFilters,
        limit: widget.limit ?? MAX_WIDGET_LIMIT
      }
    );
    const rawResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'DASHBOARD_RUN',
      targetId: `${dashboard.id}:${widget.id}`,
      objectApiName: sourceReportContext.objectApiName,
      resolvedSoql: compiled.soql,
      visibility,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      metadata: {
        appId,
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetType: widget.type
      }
    });
    const records = this.valueService.extractRecords(rawResult);

    return {
      id: widget.id,
      type: 'table',
      displayMode: 'rows',
      title: widget.title,
      columns: compiled.visibleColumns,
      rows: records.map((record) => this.mapTableRow(record, compiled.visibleColumns))
    };
  }

  private buildRowsWidgetSort(columns: ReportColumn[]): ReportSort[] {
    return columns.slice(0, 1).map((column) => ({
      field: column.field,
      direction: 'ASC'
    }));
  }

  private mapTableRow(record: Record<string, unknown>, columns: ReportColumn[]): DashboardRunTableRow {
    return {
      id: typeof record.Id === 'string' ? record.Id : this.valueService.buildSyntheticRowId(record),
      values: Object.fromEntries(columns.map((column) => [column.field, record[column.field]]))
    };
  }
}
