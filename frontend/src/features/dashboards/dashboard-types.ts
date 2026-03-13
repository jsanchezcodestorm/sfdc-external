import type {
  ReportColumn,
  ReportContactSuggestion,
  ReportPermissionSuggestion,
  ReportScalarValue,
  ReportShareGrant,
} from '../reports/report-types'

export type DashboardMetricOperation = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'

export type DashboardMetricDefinition = {
  operation: DashboardMetricOperation
  field?: string
  label?: string
}

export type DashboardFilterDefinition = {
  field: string
  label?: string
}

export type DashboardWidgetLayout = {
  widgetId: string
  x: number
  y: number
  w: number
  h: number
}

export type DashboardWidgetBaseDefinition = {
  id: string
  title: string
  layout: DashboardWidgetLayout
}

export type DashboardKpiWidgetDefinition = DashboardWidgetBaseDefinition & {
  type: 'kpi'
  metric: DashboardMetricDefinition
}

export type DashboardChartWidgetDefinition = DashboardWidgetBaseDefinition & {
  type: 'chart'
  chartType: 'bar' | 'line' | 'pie' | 'donut'
  dimensionField: string
  dimensionLabel?: string
  metric: DashboardMetricDefinition
  limit?: number
  sortDirection?: 'ASC' | 'DESC'
}

export type DashboardTableGroupedWidgetDefinition = DashboardWidgetBaseDefinition & {
  type: 'table'
  displayMode: 'grouped'
  dimensionField: string
  dimensionLabel?: string
  metric: DashboardMetricDefinition
  limit?: number
  sortDirection?: 'ASC' | 'DESC'
}

export type DashboardTableRowsWidgetDefinition = DashboardWidgetBaseDefinition & {
  type: 'table'
  displayMode: 'rows'
  columns: ReportColumn[]
  limit?: number
}

export type DashboardWidgetDefinition =
  | DashboardKpiWidgetDefinition
  | DashboardChartWidgetDefinition
  | DashboardTableGroupedWidgetDefinition
  | DashboardTableRowsWidgetDefinition

export type DashboardFolderSummary = {
  id: string
  appId: string
  label: string
  description?: string
  ownerContactId: string
  accessMode: 'personal' | 'shared'
  shares: ReportShareGrant[]
  dashboardCount: number
  canEdit: boolean
  canShare: boolean
  updatedAt: string
}

export type DashboardSummary = {
  id: string
  appId: string
  folderId: string
  sourceReportId: string
  sourceReportLabel: string
  sourceObjectApiName: string
  label: string
  description?: string
  ownerContactId: string
  shareMode: 'inherit' | 'restricted' | 'personal'
  filterCount: number
  widgetCount: number
  canEdit: boolean
  canShare: boolean
  updatedAt: string
}

export type DashboardDefinition = DashboardSummary & {
  filters: DashboardFilterDefinition[]
  widgets: DashboardWidgetDefinition[]
  shares: ReportShareGrant[]
}

export type DashboardsWorkspaceResponse = {
  appId: string
  canWrite: boolean
  folders: DashboardFolderSummary[]
}

export type DashboardFolderResponse = {
  canWrite: boolean
  folder: DashboardFolderSummary
  dashboards: DashboardSummary[]
}

export type DashboardResponse = {
  canWrite: boolean
  dashboard: DashboardDefinition
}

export type DashboardSourceReportSuggestion = {
  id: string
  label: string
  folderId: string
  folderLabel: string
  objectApiName: string
  updatedAt: string
}

export type DashboardSourceReportSuggestionResponse = {
  items: DashboardSourceReportSuggestion[]
}

export type DashboardFieldSuggestion = {
  name: string
  label: string
  type: string
  filterable: boolean
}

export type DashboardFieldSuggestionResponse = {
  items: DashboardFieldSuggestion[]
}

export type DashboardFilterOption = {
  value: ReportScalarValue
  label: string
  count: number
}

export type DashboardFilterRuntimeState = {
  field: string
  label: string
  options: DashboardFilterOption[]
  selectedValue?: ReportScalarValue
}

export type DashboardAppliedFilter = {
  field: string
  value: ReportScalarValue
}

export type DashboardRunChartPoint = {
  key: string
  label: string
  value: number
  rawValue: ReportScalarValue
}

export type DashboardRunTableGroupedRow = {
  key: string
  label: string
  rawValue: ReportScalarValue
  metricValue: number
}

export type DashboardRunTableRow = {
  id: string
  values: Record<string, unknown>
}

export type DashboardRunKpiWidget = {
  id: string
  type: 'kpi'
  title: string
  metric: DashboardMetricDefinition
  value: number
}

export type DashboardRunChartWidget = {
  id: string
  type: 'chart'
  title: string
  chartType: DashboardChartWidgetDefinition['chartType']
  metric: DashboardMetricDefinition
  dimensionField: string
  points: DashboardRunChartPoint[]
}

export type DashboardRunTableGroupedWidget = {
  id: string
  type: 'table'
  title: string
  displayMode: 'grouped'
  metric: DashboardMetricDefinition
  dimensionField: string
  rows: DashboardRunTableGroupedRow[]
}

export type DashboardRunTableRowsWidget = {
  id: string
  type: 'table'
  title: string
  displayMode: 'rows'
  columns: ReportColumn[]
  rows: DashboardRunTableRow[]
}

export type DashboardRunWidget =
  | DashboardRunKpiWidget
  | DashboardRunChartWidget
  | DashboardRunTableGroupedWidget
  | DashboardRunTableRowsWidget

export type DashboardRunResponse = {
  dashboard: DashboardDefinition
  availableFilters: DashboardFilterRuntimeState[]
  appliedFilters: DashboardAppliedFilter[]
  widgets: DashboardRunWidget[]
}

export type DashboardRunRequest = {
  filters?: DashboardAppliedFilter[]
}

export type UpsertDashboardFolderPayload = {
  folder: {
    label: string
    description?: string
    accessMode: 'personal' | 'shared'
    shares: ReportShareGrant[]
  }
}

export type UpsertDashboardPayload = {
  dashboard: {
    folderId: string
    sourceReportId: string
    label: string
    description?: string
    filters: DashboardFilterDefinition[]
    widgets: DashboardWidgetDefinition[]
    shareMode: 'inherit' | 'restricted' | 'personal'
    shares: ReportShareGrant[]
  }
}

export type DashboardContactSuggestionResponse = {
  items: ReportContactSuggestion[]
}

export type DashboardPermissionSuggestionResponse = {
  items: ReportPermissionSuggestion[]
}
