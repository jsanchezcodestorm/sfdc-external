import { BadRequestException, Injectable } from '@nestjs/common';

import { QueryAuditService } from '../../audit/query-audit.service';
import type { SessionUser } from '../../auth/session-user.interface';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import { ReportSoqlBuilderService } from '../../reports/services/report-soql-builder.service';
import { FILTER_OPTIONS_LIMIT } from '../dashboard-runtime.constants';
import type {
  DashboardAppliedFilter,
  DashboardDefinition,
  DashboardFilterDefinition,
  DashboardFilterOption,
  DashboardFilterRuntimeState,
  DashboardRuntimeReportContext
} from '../dashboards.types';
import { DashboardValueService } from './dashboard-value.service';

@Injectable()
export class DashboardRuntimeFilterService {
  constructor(
    private readonly queryAuditService: QueryAuditService,
    private readonly reportSoqlBuilderService: ReportSoqlBuilderService,
    private readonly valueService: DashboardValueService
  ) {}

  async loadFilterStates(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    appliedFilters: DashboardAppliedFilter[]
  ): Promise<DashboardFilterRuntimeState[]> {
    return Promise.all(
      dashboard.filters.map((filter) =>
        this.loadRuntimeFilterState(user, appId, dashboard, sourceReportContext, visibility, filter, appliedFilters)
      )
    );
  }

  assertAppliedFiltersAllowed(
    appliedFilters: DashboardAppliedFilter[],
    filterStates: DashboardFilterRuntimeState[]
  ): void {
    const optionKeyMapByField = new Map(
      filterStates.map((filterState) => [
        filterState.field,
        new Set(filterState.options.map((option) => this.valueService.buildScalarKey(option.value)))
      ])
    );

    for (const appliedFilter of appliedFilters) {
      const optionKeys = optionKeyMapByField.get(appliedFilter.field);
      if (!optionKeys?.has(this.valueService.buildScalarKey(appliedFilter.value))) {
        throw new BadRequestException(`Invalid dashboard filter value for field ${appliedFilter.field}`);
      }
    }
  }

  private async loadRuntimeFilterState(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    filter: DashboardFilterDefinition,
    appliedFilters: DashboardAppliedFilter[]
  ): Promise<DashboardFilterRuntimeState> {
    const siblingFilters = appliedFilters
      .filter((entry) => entry.field !== filter.field)
      .map((entry) => this.valueService.toEqualityReportFilter(entry));

    const compiled = this.reportSoqlBuilderService.buildDistinctValueQuery(
      {
        objectApiName: sourceReportContext.objectApiName,
        filters: sourceReportContext.filters
      },
      visibility,
      {
        field: filter.field,
        runtimeFilters: siblingFilters,
        limit: FILTER_OPTIONS_LIMIT
      }
    );

    const rawResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'DASHBOARD_RUN',
      targetId: `${dashboard.id}:${filter.field}:options`,
      objectApiName: sourceReportContext.objectApiName,
      resolvedSoql: compiled.soql,
      visibility,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      metadata: {
        appId,
        dashboardId: dashboard.id,
        filterField: filter.field,
        phase: 'filter-options'
      }
    });
    const records = this.valueService.extractRecords(rawResult);
    const selectedValue = appliedFilters.find((entry) => entry.field === filter.field)?.value;

    return {
      field: filter.field,
      label: filter.label?.trim() || filter.field,
      selectedValue,
      options: records.map((record) => {
        const optionValue = this.valueService.toScalarValue(record[filter.field]);
        return {
          value: optionValue,
          label: this.valueService.stringifyScalarValue(optionValue),
          count: this.valueService.toSafeNumber(record.optionCount)
        } satisfies DashboardFilterOption;
      })
    };
  }
}
