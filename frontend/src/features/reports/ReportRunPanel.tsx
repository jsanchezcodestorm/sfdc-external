import type { ReportDefinition, ReportRunGroupNode, ReportRunResponse } from './report-types'
import { formatRunValue } from './report-workspace-utils'

type ReportRunPanelProps = {
  report: ReportDefinition
  runResponse: ReportRunResponse | null
  runLoading: boolean
  runError: string | null
  onRefreshRun: () => void
  onNextPage: () => void
}

export function ReportRunPanel({
  report,
  runResponse,
  runLoading,
  runError,
  onRefreshRun,
  onNextPage,
}: ReportRunPanelProps) {
  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Esecuzione report</p>
            <p className="mt-1 text-sm text-slate-500">
              Query compilata server-side con ACL, visibility e cursor opaco.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefreshRun}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Riesegui
            </button>
            {runResponse?.nextCursor ? (
              <button
                type="button"
                onClick={onNextPage}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Pagina successiva
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{report.objectApiName}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{report.pageSize} righe per pagina</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{report.groupings.length} grouping</span>
        </div>
      </section>

      {runError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {runError}
        </div>
      ) : null}

      {runLoading ? (
        <WorkspaceState title="Esecuzione in corso..." description="Sto recuperando la pagina richiesta dal backend." />
      ) : runResponse ? (
        <>
          {runResponse.groups.length > 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Grouping</p>
              <div className="mt-4 space-y-3">
                {runResponse.groups.map((group) => (
                  <ReportGroupTree key={group.key} node={group} level={0} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Risultati</p>
                <p className="mt-1 text-sm text-slate-500">
                  {runResponse.rows.length} righe in pagina, {runResponse.total} totali.
                </p>
              </div>
            </div>

            {runResponse.rows.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      {runResponse.columns.map((column) => (
                        <th key={column.field} className="px-4 py-3 text-left">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {runResponse.rows.map((row) => (
                      <tr key={row.id}>
                        {runResponse.columns.map((column) => (
                          <td key={`${row.id}-${column.field}`} className="px-4 py-3 text-slate-700">
                            {formatRunValue(row.values[column.field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-sm text-slate-500">
                Nessuna riga restituita dal report.
              </div>
            )}
          </section>
        </>
      ) : (
        <WorkspaceState title="Run non ancora eseguito" description="Avvia l&apos;esecuzione per vedere righe e grouping del report." />
      )}
    </>
  )
}

function WorkspaceState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-slate-500">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm">{description}</p>
    </section>
  )
}

function ReportGroupTree({
  node,
  level,
}: {
  node: ReportRunGroupNode
  level: number
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900" style={{ paddingLeft: `${level * 1.25}rem` }}>
          {node.label}: {formatRunValue(node.value)}
        </p>
        <div className="flex gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <span>{node.count} record</span>
          {node.rowIds?.length ? <span>{node.rowIds.length} righe in pagina</span> : null}
        </div>
      </div>
      {node.children?.length ? (
        <div className="mt-3 space-y-2">
          {node.children.map((child) => (
            <ReportGroupTree key={child.key} node={child} level={level + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
