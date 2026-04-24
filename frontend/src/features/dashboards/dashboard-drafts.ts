import type { ReportShareGrant } from '../reports/report-types'
import type {
  DashboardDefinition,
  DashboardFilterDefinition,
  DashboardFolderSummary,
  DashboardMetricDefinition,
  DashboardWidgetDefinition,
  DashboardWidgetLayout,
  UpsertDashboardFolderPayload,
  UpsertDashboardPayload,
} from './dashboard-types'
import type { DashboardDraft, FolderDraft, WidgetEditorKind } from './dashboard-workspace-model'
import { MAX_DASHBOARD_FILTERS } from './dashboard-workspace-model'
import { clamp, trimToUndefined } from './dashboard-workspace-utils'

export function createEmptyFolderDraft(): FolderDraft {
  return {
    label: '',
    description: '',
    accessMode: 'personal',
    shares: [],
  }
}

export function createFolderDraftFromSummary(folder: DashboardFolderSummary): FolderDraft {
  return {
    label: folder.label,
    description: folder.description ?? '',
    accessMode: folder.accessMode,
    shares: [...folder.shares],
  }
}

export function createEmptyDashboardDraft(folderId: string): DashboardDraft {
  const initialWidget = createEmptyWidget('kpi', [])

  return {
    folderId,
    sourceReportId: '',
    label: '',
    description: '',
    filters: [],
    widgets: [initialWidget],
    shareMode: 'inherit',
    shares: [],
  }
}

export function createDashboardDraftFromDefinition(dashboard: DashboardDefinition): DashboardDraft {
  return {
    folderId: dashboard.folderId,
    sourceReportId: dashboard.sourceReportId,
    label: dashboard.label,
    description: dashboard.description ?? '',
    filters: dashboard.filters.map((filter) => ({ ...filter })),
    widgets: dashboard.widgets.map(cloneWidget),
    shareMode: dashboard.shareMode,
    shares: [...dashboard.shares],
  }
}

export function folderDraftToPayload(draft: FolderDraft): UpsertDashboardFolderPayload {
  const label = draft.label.trim()
  if (!label) {
    throw new Error('Label cartella obbligatoria')
  }

  const shares = draft.shares.filter(hasShareSubject)
  if (draft.accessMode === 'shared' && shares.length === 0) {
    throw new Error('Le cartelle condivise richiedono almeno uno share grant')
  }

  return {
    folder: {
      label,
      description: trimToUndefined(draft.description),
      accessMode: draft.accessMode,
      shares,
    },
  }
}

export function dashboardDraftToPayload(draft: DashboardDraft): UpsertDashboardPayload {
  const folderId = draft.folderId.trim()
  const sourceReportId = draft.sourceReportId.trim()
  const label = draft.label.trim()

  if (!folderId) {
    throw new Error('Folder obbligatoria')
  }

  if (!sourceReportId) {
    throw new Error('Source report obbligatorio')
  }

  if (!label) {
    throw new Error('Label dashboard obbligatoria')
  }

  if (draft.filters.length > MAX_DASHBOARD_FILTERS) {
    throw new Error(`Sono supportati al massimo ${MAX_DASHBOARD_FILTERS} filtri globali`)
  }

  if (draft.widgets.length === 0) {
    throw new Error('La dashboard richiede almeno un widget')
  }

  const filters = draft.filters.map((filter, index) => {
    const field = filter.field.trim()
    if (!field) {
      throw new Error(`Filtro ${index + 1}: field obbligatorio`)
    }

    return {
      field,
      label: trimToUndefined(filter.label),
    } satisfies DashboardFilterDefinition
  })

  const shares = draft.shares.filter(hasShareSubject)
  if (draft.shareMode === 'restricted' && shares.length === 0) {
    throw new Error('Le dashboard restricted richiedono almeno uno share grant')
  }

  return {
    dashboard: {
      folderId,
      sourceReportId,
      label,
      description: trimToUndefined(draft.description),
      filters,
      widgets: draft.widgets.map((widget, index) => normalizeWidget(widget, index)),
      shareMode: draft.shareMode,
      shares,
    },
  }
}

export function createEmptyWidget(kind: WidgetEditorKind, widgets: DashboardWidgetDefinition[]): DashboardWidgetDefinition {
  const id = createNextWidgetId(widgets)
  const layout = createDefaultLayout(id, widgets.length, kind)

  switch (kind) {
    case 'kpi':
      return {
        id,
        type: 'kpi',
        title: 'Nuovo KPI',
        layout,
        metric: { operation: 'COUNT' },
      }
    case 'chart':
      return {
        id,
        type: 'chart',
        title: 'Nuovo chart',
        layout,
        chartType: 'bar',
        dimensionField: '',
        metric: { operation: 'COUNT' },
        limit: 10,
        sortDirection: 'DESC',
      }
    case 'table-grouped':
      return {
        id,
        type: 'table',
        title: 'Nuova grouped table',
        layout,
        displayMode: 'grouped',
        dimensionField: '',
        metric: { operation: 'COUNT' },
        limit: 10,
        sortDirection: 'DESC',
      }
    case 'table-rows':
      return {
        id,
        type: 'table',
        title: 'Nuova rows table',
        layout,
        displayMode: 'rows',
        columns: [{ field: 'Id', label: 'ID' }],
        limit: 10,
      }
  }
}

export function cloneWidget(widget: DashboardWidgetDefinition): DashboardWidgetDefinition {
  if (widget.type === 'kpi') {
    return {
      ...widget,
      layout: { ...widget.layout },
      metric: { ...widget.metric },
    }
  }

  if (widget.type === 'chart') {
    return {
      ...widget,
      layout: { ...widget.layout },
      metric: { ...widget.metric },
    }
  }

  if (widget.displayMode === 'grouped') {
    return {
      ...widget,
      layout: { ...widget.layout },
      metric: { ...widget.metric },
    }
  }

  return {
    ...widget,
    layout: { ...widget.layout },
    columns: widget.columns.map((column) => ({ ...column })),
  }
}

export function renameWidget(widget: DashboardWidgetDefinition, nextId: string): DashboardWidgetDefinition {
  return {
    ...widget,
    id: nextId,
    layout: {
      ...widget.layout,
      widgetId: nextId,
    },
  }
}

export function toWidgetEditorKind(widget: DashboardWidgetDefinition): WidgetEditorKind {
  if (widget.type === 'kpi') {
    return 'kpi'
  }
  if (widget.type === 'chart') {
    return 'chart'
  }
  return widget.displayMode === 'rows' ? 'table-rows' : 'table-grouped'
}

export function convertWidgetKind(widget: DashboardWidgetDefinition, nextKind: WidgetEditorKind): DashboardWidgetDefinition {
  const layout = { ...widget.layout }
  const id = widget.id
  const title = widget.title

  switch (nextKind) {
    case 'kpi':
      return {
        id,
        type: 'kpi',
        title,
        layout,
        metric: widget.type === 'kpi' ? widget.metric : { operation: 'COUNT' },
      }
    case 'chart':
      return {
        id,
        type: 'chart',
        title,
        layout,
        chartType: widget.type === 'chart' ? widget.chartType : 'bar',
        dimensionField: widget.type === 'chart' ? widget.dimensionField : '',
        dimensionLabel: widget.type === 'chart' ? widget.dimensionLabel : undefined,
        metric: widget.type === 'kpi' ? { ...widget.metric } : widget.type === 'chart' ? widget.metric : { operation: 'COUNT' },
        limit: widget.type === 'chart' ? widget.limit : 10,
        sortDirection: widget.type === 'chart' ? widget.sortDirection : 'DESC',
      }
    case 'table-grouped':
      return {
        id,
        type: 'table',
        title,
        layout,
        displayMode: 'grouped',
        dimensionField: widget.type === 'chart' ? widget.dimensionField : '',
        dimensionLabel: widget.type === 'chart' ? widget.dimensionLabel : undefined,
        metric:
          widget.type === 'kpi'
            ? { ...widget.metric }
            : widget.type === 'chart'
              ? widget.metric
              : widget.type === 'table' && widget.displayMode === 'grouped'
                ? widget.metric
                : { operation: 'COUNT' },
        limit: widget.type === 'table' && widget.displayMode === 'grouped' ? widget.limit : 10,
        sortDirection: widget.type === 'table' && widget.displayMode === 'grouped' ? widget.sortDirection : 'DESC',
      }
    case 'table-rows':
      return {
        id,
        type: 'table',
        title,
        layout,
        displayMode: 'rows',
        columns: widget.type === 'table' && widget.displayMode === 'rows' ? widget.columns : [{ field: 'Id', label: 'ID' }],
        limit: widget.type === 'table' && widget.displayMode === 'rows' ? widget.limit : 10,
      }
  }
}

export function hasShareSubject(share: ReportShareGrant): boolean {
  return share.subjectId.trim().length > 0
}

function normalizeWidget(widget: DashboardWidgetDefinition, index: number): DashboardWidgetDefinition {
  const id = widget.id.trim()
  const title = widget.title.trim()

  if (!id) {
    throw new Error(`Widget ${index + 1}: id obbligatorio`)
  }

  if (!title) {
    throw new Error(`Widget ${index + 1}: titolo obbligatorio`)
  }

  const layout = normalizeWidgetLayout(widget.layout, id, index)

  if (widget.type === 'kpi') {
    return {
      id,
      type: 'kpi',
      title,
      layout,
      metric: normalizeMetric(widget.metric, index),
    }
  }

  if (widget.type === 'chart') {
    const dimensionField = widget.dimensionField.trim()
    if (!dimensionField) {
      throw new Error(`Widget ${index + 1}: dimension field obbligatorio`)
    }

    return {
      ...widget,
      id,
      title,
      layout,
      dimensionField,
      dimensionLabel: trimToUndefined(widget.dimensionLabel),
      metric: normalizeMetric(widget.metric, index),
      limit: clampOptionalLimit(widget.limit, index),
      sortDirection: widget.sortDirection ?? 'DESC',
    }
  }

  if (widget.displayMode === 'grouped') {
    const dimensionField = widget.dimensionField.trim()
    if (!dimensionField) {
      throw new Error(`Widget ${index + 1}: dimension field obbligatorio`)
    }

    return {
      ...widget,
      id,
      title,
      layout,
      dimensionField,
      dimensionLabel: trimToUndefined(widget.dimensionLabel),
      metric: normalizeMetric(widget.metric, index),
      limit: clampOptionalLimit(widget.limit, index),
      sortDirection: widget.sortDirection ?? 'DESC',
    }
  }

  if (widget.columns.length === 0) {
    throw new Error(`Widget ${index + 1}: la rows table richiede almeno una colonna`)
  }

  return {
    ...widget,
    id,
    title,
    layout,
    columns: widget.columns.map((column, columnIndex) => {
      const field = column.field.trim()
      if (!field) {
        throw new Error(`Widget ${index + 1}: colonna ${columnIndex + 1} senza field`)
      }

      return {
        field,
        label: trimToUndefined(column.label),
      }
    }),
    limit: clampOptionalLimit(widget.limit, index),
  }
}

function normalizeMetric(metric: DashboardMetricDefinition, widgetIndex: number): DashboardMetricDefinition {
  if (metric.operation === 'COUNT') {
    return {
      operation: 'COUNT',
      label: trimToUndefined(metric.label),
    }
  }

  const field = metric.field?.trim() ?? ''
  if (!field) {
    throw new Error(`Widget ${widgetIndex + 1}: il campo metrica è obbligatorio per ${metric.operation}`)
  }

  return {
    operation: metric.operation,
    field,
    label: trimToUndefined(metric.label),
  }
}

function normalizeWidgetLayout(layout: DashboardWidgetLayout, widgetId: string, widgetIndex: number): DashboardWidgetLayout {
  const x = clamp(Math.trunc(layout.x), 0, 11)
  const y = clamp(Math.trunc(layout.y), 0, 99)
  const w = clamp(Math.trunc(layout.w), 1, 12)
  const h = clamp(Math.trunc(layout.h), 1, 8)

  if (!widgetId) {
    throw new Error(`Widget ${widgetIndex + 1}: widgetId layout obbligatorio`)
  }

  return {
    widgetId,
    x,
    y,
    w,
    h,
  }
}

function clampOptionalLimit(limit: number | undefined, widgetIndex: number): number | undefined {
  if (limit === undefined || limit === null) {
    return undefined
  }

  const normalized = Math.trunc(limit)
  if (!Number.isFinite(normalized) || normalized < 1 || normalized > 50) {
    throw new Error(`Widget ${widgetIndex + 1}: limit deve essere compreso tra 1 e 50`)
  }

  return normalized
}

function createNextWidgetId(widgets: DashboardWidgetDefinition[]): string {
  const ids = new Set(widgets.map((widget) => widget.id))
  let index = widgets.length + 1
  while (ids.has(`widget-${index}`)) {
    index += 1
  }
  return `widget-${index}`
}

function createDefaultLayout(widgetId: string, index: number, kind: WidgetEditorKind): DashboardWidgetLayout {
  const baseWidth = kind === 'kpi' ? 4 : kind === 'table-rows' ? 12 : 6
  const baseHeight = kind === 'kpi' ? 2 : 4

  return {
    widgetId,
    x: (index % 2) * 6,
    y: Math.floor(index / 2) * 4,
    w: baseWidth,
    h: baseHeight,
  }
}
