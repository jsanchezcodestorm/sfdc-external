import type {
  DashboardRunChartPoint,
  DashboardRunChartWidget,
  DashboardRunTableGroupedWidget,
  DashboardRunTableRowsWidget,
  DashboardRunWidget,
  DashboardWidgetDefinition,
} from './dashboard-types'
import {
  buildWidgetGridStyle,
  describeWidgetDefinition,
  formatMetricLabel,
  formatNumericValue,
  formatRunValue,
} from './dashboard-workspace-utils'

const CHART_COLORS = ['#0f766e', '#2563eb', '#ea580c', '#be123c', '#7c3aed', '#047857', '#9333ea', '#ca8a04']

export function DashboardRunWidgetCard({
  definition,
  widget,
}: {
  definition: DashboardWidgetDefinition
  widget: DashboardRunWidget | null
}) {
  return (
    <article
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      style={buildWidgetGridStyle(definition.layout)}
    >
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{definition.title}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">
              {describeWidgetDefinition(definition)}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
            {definition.id}
          </span>
        </div>
      </header>

      <div className="h-[calc(100%-4.25rem)] overflow-auto px-5 py-4">
        {!widget ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Nessun dato disponibile per questo widget.
          </div>
        ) : widget.type === 'kpi' ? (
          <KpiWidgetView widget={widget} />
        ) : widget.type === 'chart' ? (
          <ChartWidgetView widget={widget} />
        ) : widget.displayMode === 'grouped' ? (
          <GroupedTableWidgetView widget={widget} />
        ) : (
          <RowsTableWidgetView widget={widget} />
        )}
      </div>
    </article>
  )
}

function KpiWidgetView({ widget }: { widget: Extract<DashboardRunWidget, { type: 'kpi' }> }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {formatMetricLabel(widget.metric)}
      </p>
      <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950">{formatNumericValue(widget.value)}</p>
    </div>
  )
}

function ChartWidgetView({ widget }: { widget: DashboardRunChartWidget }) {
  if (widget.points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Nessun dato disponibile per il grafico.
      </div>
    )
  }

  switch (widget.chartType) {
    case 'bar':
      return <BarChartWidgetView points={widget.points} />
    case 'line':
      return <LineChartWidgetView points={widget.points} />
    case 'pie':
      return <PieChartWidgetView points={widget.points} donut={false} />
    case 'donut':
      return <PieChartWidgetView points={widget.points} donut />
  }
}

function BarChartWidgetView({ points }: { points: DashboardRunChartPoint[] }) {
  const maxValue = Math.max(...points.map((point) => point.value), 1)

  return (
    <div className="space-y-3">
      {points.map((point, index) => (
        <div key={point.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{point.label}</span>
            <span className="font-semibold text-slate-950">{formatNumericValue(point.value)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full"
              style={{
                width: `${Math.max((point.value / maxValue) * 100, 2)}%`,
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function LineChartWidgetView({ points }: { points: DashboardRunChartPoint[] }) {
  const width = 420
  const height = 180
  const padding = 18
  const maxValue = Math.max(...points.map((point) => point.value), 1)
  const minValue = Math.min(...points.map((point) => point.value), 0)
  const range = Math.max(maxValue - minValue, 1)
  const polyline = points
    .map((point, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1)
      const y = height - padding - ((point.value - minValue) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-2xl border border-slate-200 bg-slate-50">
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <polyline fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={polyline} />
        {points.map((point, index) => {
          const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1)
          const y = height - padding - ((point.value - minValue) / range) * (height - padding * 2)
          return <circle key={point.key} cx={x} cy={y} r="4.5" fill="#0f172a" />
        })}
      </svg>
      <div className="grid gap-2 md:grid-cols-2">
        {points.map((point) => (
          <div key={point.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="truncate font-medium text-slate-700">{point.label}</p>
            <p className="mt-1 font-semibold text-slate-950">{formatNumericValue(point.value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PieChartWidgetView({
  points,
  donut,
}: {
  points: DashboardRunChartPoint[]
  donut: boolean
}) {
  const total = Math.max(points.reduce((sum, point) => sum + point.value, 0), 1)
  const gradientStops = points
    .reduce<Array<string>>((segments, point, index) => {
      const previousValue = points.slice(0, index).reduce((sum, entry) => sum + entry.value, 0)
      const start = (previousValue / total) * 100
      const end = ((previousValue + point.value) / total) * 100
      const color = CHART_COLORS[index % CHART_COLORS.length]
      segments.push(`${color} ${start}% ${end}%`)
      return segments
    }, [])
    .join(', ')

  return (
    <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="flex items-center justify-center">
        <div
          className={`relative h-44 w-44 rounded-full border border-slate-200 ${donut ? 'after:absolute after:inset-[22%] after:rounded-full after:bg-white after:content-[\'\']' : ''}`}
          style={{ backgroundImage: `conic-gradient(${gradientStops})` }}
        >
          <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-slate-900">
            {formatNumericValue(total)}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {points.map((point, index) => (
          <div key={point.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              <span className="truncate">{point.label}</span>
            </span>
            <span className="font-semibold text-slate-950">
              {formatNumericValue(point.value)} · {Math.round((point.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupedTableWidgetView({ widget }: { widget: DashboardRunTableGroupedWidget }) {
  return widget.rows.length ? (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-3 py-3 text-left">Dimensione</th>
            <th className="px-3 py-3 text-right">Valore</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {widget.rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-3 text-slate-700">{row.label}</td>
              <td className="px-3 py-3 text-right font-semibold text-slate-950">{formatNumericValue(row.metricValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      Nessuna aggregazione disponibile.
    </div>
  )
}

function RowsTableWidgetView({ widget }: { widget: DashboardRunTableRowsWidget }) {
  return widget.rows.length ? (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              {widget.columns.map((column) => (
                <th key={column.field} className="px-3 py-3 text-left">
                  {column.label || column.field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {widget.rows.map((row) => (
              <tr key={row.id}>
                {widget.columns.map((column) => (
                  <td key={`${row.id}-${column.field}`} className="px-3 py-3 text-slate-700">
                    {formatRunValue(row.values[column.field])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      Nessuna riga disponibile.
    </div>
  )
}
