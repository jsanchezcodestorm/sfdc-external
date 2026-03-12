import type { ReportColumn, ReportFilter, ReportScalarValue, ReportShareGrant } from '../reports/reports.types';

export type DashboardMetricOperation = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

export interface DashboardMetricDefinition {
  operation: DashboardMetricOperation;
  field?: string;
  label?: string;
}

export interface DashboardFilterDefinition {
  field: string;
  label?: string;
}

export interface DashboardWidgetLayout {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidgetBaseDefinition {
  id: string;
  title: string;
  layout: DashboardWidgetLayout;
}

export interface DashboardKpiWidgetDefinition extends DashboardWidgetBaseDefinition {
  type: 'kpi';
  metric: DashboardMetricDefinition;
}

export interface DashboardChartWidgetDefinition extends DashboardWidgetBaseDefinition {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'donut';
  dimensionField: string;
  dimensionLabel?: string;
  metric: DashboardMetricDefinition;
  limit?: number;
  sortDirection?: 'ASC' | 'DESC';
}

export interface DashboardTableGroupedWidgetDefinition extends DashboardWidgetBaseDefinition {
  type: 'table';
  displayMode: 'grouped';
  dimensionField: string;
  dimensionLabel?: string;
  metric: DashboardMetricDefinition;
  limit?: number;
  sortDirection?: 'ASC' | 'DESC';
}

export interface DashboardTableRowsWidgetDefinition extends DashboardWidgetBaseDefinition {
  type: 'table';
  displayMode: 'rows';
  columns: ReportColumn[];
  limit?: number;
}

export type DashboardWidgetDefinition =
  | DashboardKpiWidgetDefinition
  | DashboardChartWidgetDefinition
  | DashboardTableGroupedWidgetDefinition
  | DashboardTableRowsWidgetDefinition;

export interface DashboardFolderSummary {
  id: string;
  appId: string;
  label: string;
  description?: string;
  ownerContactId: string;
  accessMode: 'personal' | 'shared';
  shares: ReportShareGrant[];
  dashboardCount: number;
  canEdit: boolean;
  canShare: boolean;
  updatedAt: string;
}

export interface DashboardSummary {
  id: string;
  appId: string;
  folderId: string;
  sourceReportId: string;
  sourceReportLabel: string;
  sourceObjectApiName: string;
  label: string;
  description?: string;
  ownerContactId: string;
  shareMode: 'inherit' | 'restricted' | 'personal';
  filterCount: number;
  widgetCount: number;
  canEdit: boolean;
  canShare: boolean;
  updatedAt: string;
}

export interface DashboardDefinition extends DashboardSummary {
  filters: DashboardFilterDefinition[];
  widgets: DashboardWidgetDefinition[];
  shares: ReportShareGrant[];
}

export interface DashboardsWorkspaceResponse {
  appId: string;
  canWrite: boolean;
  folders: DashboardFolderSummary[];
}

export interface DashboardFolderResponse {
  canWrite: boolean;
  folder: DashboardFolderSummary;
  dashboards: DashboardSummary[];
}

export interface DashboardResponse {
  canWrite: boolean;
  dashboard: DashboardDefinition;
}

export interface DashboardSourceReportSuggestion {
  id: string;
  label: string;
  folderId: string;
  folderLabel: string;
  objectApiName: string;
  updatedAt: string;
}

export interface DashboardSourceReportSuggestionResponse {
  items: DashboardSourceReportSuggestion[];
}

export interface DashboardFieldSuggestion {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

export interface DashboardFieldSuggestionResponse {
  items: DashboardFieldSuggestion[];
}

export interface DashboardFilterOption {
  value: ReportScalarValue;
  label: string;
  count: number;
}

export interface DashboardFilterRuntimeState {
  field: string;
  label: string;
  options: DashboardFilterOption[];
  selectedValue?: ReportScalarValue;
}

export interface DashboardAppliedFilter {
  field: string;
  value: ReportScalarValue;
}

export interface DashboardRunChartPoint {
  key: string;
  label: string;
  value: number;
  rawValue: ReportScalarValue;
}

export interface DashboardRunTableGroupedRow {
  key: string;
  label: string;
  rawValue: ReportScalarValue;
  metricValue: number;
}

export interface DashboardRunTableRow {
  id: string;
  values: Record<string, unknown>;
}

export interface DashboardRunWidgetBase {
  id: string;
  type: DashboardWidgetDefinition['type'];
  title: string;
}

export interface DashboardRunKpiWidget extends DashboardRunWidgetBase {
  type: 'kpi';
  metric: DashboardMetricDefinition;
  value: number;
}

export interface DashboardRunChartWidget extends DashboardRunWidgetBase {
  type: 'chart';
  chartType: DashboardChartWidgetDefinition['chartType'];
  metric: DashboardMetricDefinition;
  dimensionField: string;
  points: DashboardRunChartPoint[];
}

export interface DashboardRunTableGroupedWidget extends DashboardRunWidgetBase {
  type: 'table';
  displayMode: 'grouped';
  metric: DashboardMetricDefinition;
  dimensionField: string;
  rows: DashboardRunTableGroupedRow[];
}

export interface DashboardRunTableRowsWidget extends DashboardRunWidgetBase {
  type: 'table';
  displayMode: 'rows';
  columns: ReportColumn[];
  rows: DashboardRunTableRow[];
}

export type DashboardRunWidget =
  | DashboardRunKpiWidget
  | DashboardRunChartWidget
  | DashboardRunTableGroupedWidget
  | DashboardRunTableRowsWidget;

export interface DashboardRunResponse {
  dashboard: DashboardDefinition;
  availableFilters: DashboardFilterRuntimeState[];
  appliedFilters: DashboardAppliedFilter[];
  widgets: DashboardRunWidget[];
}

export interface DashboardRunRequest {
  filters?: Array<{
    field: string;
    value: ReportScalarValue;
  }>;
}

export interface UpsertDashboardFolderInput {
  label: string;
  description?: string;
  accessMode: 'personal' | 'shared';
  shares: ReportShareGrant[];
}

export interface UpsertDashboardDefinitionInput {
  folderId: string;
  sourceReportId: string;
  label: string;
  description?: string;
  filters: DashboardFilterDefinition[];
  widgets: DashboardWidgetDefinition[];
  shareMode: 'inherit' | 'restricted' | 'personal';
  shares: ReportShareGrant[];
}

export interface DashboardRuntimeReportContext {
  objectApiName: string;
  filters: ReportFilter[];
}
