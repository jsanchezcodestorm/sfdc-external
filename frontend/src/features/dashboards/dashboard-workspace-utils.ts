import type { CSSProperties } from 'react'

import type { ReportScalarValue } from '../reports/report-types'
import type {
  DashboardAppliedFilter,
  DashboardMetricDefinition,
  DashboardWidgetDefinition,
  DashboardWidgetLayout,
} from './dashboard-types'
import type { DashboardRouteSelection } from './dashboard-workspace-model'

export function buildDashboardItemBasePath(appId: string, itemId: string): string {
  return `/app/${encodeURIComponent(appId)}/items/${encodeURIComponent(itemId)}`
}

export function buildDashboardFolderPath(basePath: string, folderId: string): string {
  return `${basePath}/folders/${encodeURIComponent(folderId)}`
}

export function buildDashboardPath(basePath: string, dashboardId: string): string {
  return `${basePath}/dashboards/${encodeURIComponent(dashboardId)}`
}

export function parseDashboardRoute(nestedPath: string): DashboardRouteSelection {
  const normalizedPath = nestedPath.trim().replace(/^\/+|\/+$/g, '')
  if (!normalizedPath) {
    return { kind: 'workspace' }
  }

  const segments = normalizedPath.split('/')
  if (segments.length !== 2) {
    return { kind: 'invalid' }
  }

  const scope = segments[0]
  const id = decodeURIComponent(segments[1] ?? '').trim()
  if (!id) {
    return { kind: 'invalid' }
  }

  if (scope === 'folders') {
    return { kind: 'folder', folderId: id }
  }

  if (scope === 'dashboards') {
    return { kind: 'dashboard', dashboardId: id }
  }

  return { kind: 'invalid' }
}

export function trimToUndefined(value: string | undefined | null): string | undefined {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : undefined
}

export function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('it-IT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return value
  }
}

export function formatRunValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False'
  }

  if (typeof value === 'number') {
    return formatNumericValue(value)
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

export function formatNumericValue(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value)
}

export function formatMetricLabel(metric: DashboardMetricDefinition): string {
  if (metric.label?.trim()) {
    return metric.label.trim()
  }

  return metric.operation === 'COUNT'
    ? 'Record count'
    : `${metric.operation} ${metric.field ?? ''}`.trim()
}

export function parseOptionalPositiveInteger(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  const parsed = Number.parseInt(normalized, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function parseIntegerOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : 0
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function encodeScalarValue(value: ReportScalarValue): string {
  return JSON.stringify(value)
}

export function decodeAppliedFilters(values: Record<string, string>): DashboardAppliedFilter[] {
  return Object.entries(values)
    .filter(([, encodedValue]) => encodedValue !== '')
    .map(([field, encodedValue]) => ({
      field,
      value: JSON.parse(encodedValue) as ReportScalarValue,
    }))
}

export function mapAppliedFiltersToInput(filters: DashboardAppliedFilter[]): Record<string, string> {
  return Object.fromEntries(filters.map((filter) => [filter.field, encodeScalarValue(filter.value)]))
}

export function describeWidgetDefinition(widget: DashboardWidgetDefinition): string {
  if (widget.type === 'kpi') {
    return `${widget.type} · ${widget.metric.operation}`
  }

  if (widget.type === 'chart') {
    return `${widget.chartType} · ${widget.metric.operation}${widget.metric.field ? ` ${widget.metric.field}` : ''}`
  }

  if (widget.displayMode === 'grouped') {
    return `table grouped · ${widget.metric.operation}${widget.metric.field ? ` ${widget.metric.field}` : ''}`
  }

  return `table rows · ${widget.columns.length} colonne`
}

export function compareWidgetLayout(a: DashboardWidgetDefinition, b: DashboardWidgetDefinition): number {
  if (a.layout.y !== b.layout.y) {
    return a.layout.y - b.layout.y
  }

  if (a.layout.x !== b.layout.x) {
    return a.layout.x - b.layout.x
  }

  return a.title.localeCompare(b.title)
}

export function buildWidgetGridStyle(layout: DashboardWidgetLayout): CSSProperties {
  const startColumn = clamp(layout.x, 0, 11) + 1
  const columnSpan = clamp(layout.w, 1, 12 - startColumn + 1)
  const rowStart = clamp(layout.y, 0, 99) + 1
  const rowSpan = clamp(layout.h, 1, 8)

  return {
    gridColumn: `${startColumn} / span ${columnSpan}`,
    gridRow: `${rowStart} / span ${rowSpan}`,
    minHeight: `${rowSpan * 72}px`,
  }
}
