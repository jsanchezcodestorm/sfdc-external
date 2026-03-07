import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchVisibilityRules } from '../visibility-admin-api'
import { ToneBadge } from '../components/VisibilityAdminPrimitives'
import type { VisibilityRuleSummary } from '../visibility-admin-types'
import {
  buildVisibilityRuleCreatePath,
  buildVisibilityRuleEditPath,
  buildVisibilityRuleViewPath,
  formatVisibilityDateTime,
} from '../visibility-admin-utils'

export function VisibilityRulesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<VisibilityRuleSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchVisibilityRules()
      .then((payload) => {
        if (cancelled) {
          return
        }

        setItems(payload.items ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento visibility rules'
        setPageError(message)
        setItems([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length === 0) {
      return items
    }

    return items.filter((item) =>
      [item.coneCode, item.objectApiName, item.effect].join(' ').toLowerCase().includes(normalizedQuery),
    )
  }, [items, query])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Catalogo
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Visibility Rules</h2>
          <p className="mt-1 text-sm text-slate-600">
            Lista tabellare delle regole ALLOW/DENY con view readonly ed editor visuale.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
          <label className="w-full text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:min-w-80">
            Filtro
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca per cone, object API name o effect"
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <button
            type="button"
            onClick={() => navigate(buildVisibilityRuleCreatePath())}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Nuova rule
          </button>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento visibility rules...</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Cone</th>
                  <th className="px-4 py-3 text-left">Object API Name</th>
                  <th className="px-4 py-3 text-left">Effect</th>
                  <th className="px-4 py-3 text-left">Active</th>
                  <th className="px-4 py-3 text-left">Fields Allowed</th>
                  <th className="px-4 py-3 text-left">Fields Denied</th>
                  <th className="px-4 py-3 text-left">Updated</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="bg-white">
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.coneCode}</td>
                      <td className="px-4 py-3 text-slate-700">{item.objectApiName}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <ToneBadge tone={item.effect === 'ALLOW' ? 'green' : 'rose'}>
                          {item.effect}
                        </ToneBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.active ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 text-slate-700">{item.fieldsAllowedCount}</td>
                      <td className="px-4 py-3 text-slate-700">{item.fieldsDeniedCount}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatVisibilityDateTime(item.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(buildVisibilityRuleViewPath(item.id))}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(buildVisibilityRuleEditPath(item.id))}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-sm text-slate-500">
                      {query.trim().length > 0
                        ? 'Nessuna rule corrisponde al filtro.'
                        : 'Nessuna visibility rule configurata.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

