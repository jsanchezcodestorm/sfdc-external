import { useEffect, useMemo, useState } from 'react'

import { ApiError } from '../../../lib/api'
import { runDashboard } from '../../dashboards/dashboard-api'
import type {
  DashboardRunChartWidget,
  DashboardRunResponse,
  DashboardRunTableGroupedWidget,
  DashboardRunTableRowsWidget,
  DashboardRunWidget,
} from '../../dashboards/dashboard-types'

type EmbeddedDashboardBlockProps = {
  appId: string
  dashboardId: string
}

export function EmbeddedDashboardBlock({ appId, dashboardId }: EmbeddedDashboardBlockProps) {
  const [data, setData] = useState<DashboardRunResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runtimeFilters, setRuntimeFilters] = useState<Record<string, string>>({})

  const refresh = async (filters: Record<string, string>) => {
    setLoading(true)

    try {
      const payload = await runDashboard(appId, dashboardId, {
        filters: Object.entries(filters)
          .filter(([, value]) => value.length > 0)
          .map(([field, value]) => ({ field, value: decodeFilterValue(value) })),
      })
      setData(payload)
      setError(null)
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 403) {
        setError('Accesso negato alla dashboard')
      } else if (fetchError instanceof ApiError && fetchError.status === 404) {
        setError('Dashboard non disponibile')
      } else {
        setError(fetchError instanceof Error ? fetchError.message : 'Errore caricamento dashboard')
      }
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const initialFilters: Record<string, string> = {}
    setRuntimeFilters(initialFilters)
    setLoading(true)
    void runDashboard(appId, dashboardId, { filters: [] })
      .then((payload) => {
        setData(payload)
        setError(null)
      })
      .catch((fetchError) => {
        if (fetchError instanceof ApiError && fetchError.status === 403) {
          setError('Accesso negato alla dashboard')
        } else if (fetchError instanceof ApiError && fetchError.status === 404) {
          setError('Dashboard non disponibile')
        } else {
          setError(fetchError instanceof Error ? fetchError.message : 'Errore caricamento dashboard')
        }
        setData(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [appId, dashboardId])

  const widgets = useMemo(() => data?.widgets ?? [], [data?.widgets])

  if (loading && !data) {
    return <EmbeddedDashboardState title="Caricamento dashboard..." tone="neutral" />
  }

  if (error) {
    return <EmbeddedDashboardState title={error} tone={error.includes('Accesso negato') ? 'warning' : 'error'} />
  }

  if (!data) {
    return <EmbeddedDashboardState title="Dashboard non disponibile" tone="error" />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">{data.dashboard.label}</p>
          <p className="mt-1 text-xs text-slate-500">
            {data.dashboard.sourceReportLabel} · {data.dashboard.widgetCount} widget
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refresh(runtimeFilters)
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {data.availableFilters.length ? (
        <div className="grid gap-3 border-b border-slate-200 px-5 py-4 lg:grid-cols-2">
          {data.availableFilters.map((filter) => (
            <label key={filter.field} className="text-sm font-medium text-slate-700">
              {filter.label}
              <select
                value={runtimeFilters[filter.field] ?? ''}
                onChange={(event) => {
                  const nextFilters = {
                    ...runtimeFilters,
                    [filter.field]: event.target.value,
                  }
                  setRuntimeFilters(nextFilters)
                  void refresh(nextFilters)
                }}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              >
                <option value="">Tutti i valori</option>
                {filter.options.map((option) => (
                  <option
                    key={`${filter.field}-${encodeFilterValue(option.value)}`}
                    value={encodeFilterValue(option.value)}
                  >
                    {option.label} ({option.count})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex-1 overflow-auto px-5 py-4">
        {loading ? (
          <EmbeddedDashboardState title="Aggiornamento widget..." tone="neutral" compact />
        ) : widgets.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {widgets.map((widget) => (
              <EmbeddedDashboardWidgetCard key={widget.id} widget={widget} />
            ))}
          </div>
        ) : (
          <EmbeddedDashboardState title="Nessun dato disponibile" tone="neutral" compact />
        )}
      </div>
    </div>
  )
}

function EmbeddedDashboardWidgetCard({ widget }: { widget: DashboardRunWidget }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{widget.title}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">{widget.type}</p>
        </div>
      </div>

      <div className="mt-4">
        {widget.type === 'kpi' ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              {widget.metric.operation}
            </p>
            <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
              {formatNumericValue(widget.value)}
            </p>
          </div>
        ) : widget.type === 'chart' ? (
          <EmbeddedChartWidget widget={widget} />
        ) : widget.displayMode === 'grouped' ? (
          <EmbeddedGroupedTable widget={widget} />
        ) : (
          <EmbeddedRowsTable widget={widget} />
        )}
      </div>
    </article>
  )
}

function EmbeddedChartWidget({ widget }: { widget: DashboardRunChartWidget }) {
  if (!widget.points.length) {
    return <p className="text-sm text-slate-500">Nessun dato disponibile.</p>
  }

  const maxValue = Math.max(...widget.points.map((point) => point.value), 1)
  return (
    <div className="space-y-3">
      {widget.points.map((point) => (
        <div key={point.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{point.label}</span>
            <span className="font-semibold text-slate-950">{formatNumericValue(point.value)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-slate-200">
            <div
              className="h-2.5 rounded-full bg-sky-600"
              style={{ width: `${Math.max((point.value / maxValue) * 100, 4)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmbeddedGroupedTable({ widget }: { widget: DashboardRunTableGroupedWidget }) {
  if (!widget.rows.length) {
    return <p className="text-sm text-slate-500">Nessun dato disponibile.</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-white text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Valore</th>
            <th className="px-3 py-2 text-right">Metric</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-slate-50">
          {widget.rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-2 text-slate-700">{row.label}</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                {formatNumericValue(row.metricValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmbeddedRowsTable({ widget }: { widget: DashboardRunTableRowsWidget }) {
  if (!widget.rows.length) {
    return <p className="text-sm text-slate-500">Nessun dato disponibile.</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-white text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            {widget.columns.map((column) => (
              <th key={column.field} className="px-3 py-2 text-left">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-slate-50">
          {widget.rows.map((row) => (
            <tr key={row.id}>
              {widget.columns.map((column) => (
                <td key={`${row.id}-${column.field}`} className="px-3 py-2 text-slate-700">
                  {String(row.values[column.field] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmbeddedDashboardState({
  title,
  tone,
  compact = false,
}: {
  title: string
  tone: 'neutral' | 'warning' | 'error'
  compact?: boolean
}) {
  const toneClassName =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'

  return (
    <div
      className={`flex h-full items-center justify-center rounded-2xl border px-4 text-center text-sm ${toneClassName} ${compact ? 'py-8' : 'py-10'}`}
    >
      {title}
    </div>
  )
}

function formatNumericValue(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: 2,
  }).format(value)
}

function encodeFilterValue(value: DashboardRunResponse['appliedFilters'][number]['value']): string {
  return JSON.stringify(value)
}

function decodeFilterValue(value: string): DashboardRunResponse['appliedFilters'][number]['value'] {
  return JSON.parse(value) as DashboardRunResponse['appliedFilters'][number]['value']
}
