import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  formatAclResourceAccessMode,
  formatAclResourceManagedBy,
  formatAclResourceSyncState,
} from '../../../lib/acl-resource-status'
import { fetchAclResources } from '../acl-admin-api'
import type { AclAdminResourceSummary, AclResourceType } from '../acl-admin-types'
import { ACL_RESOURCE_TYPE_OPTIONS } from '../acl-admin-utils'

type ResourceFilter = 'all' | AclResourceType

export function AclResourcesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AclAdminResourceSummary[]>([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ResourceFilter>('all')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchAclResources()
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

        const message = error instanceof Error ? error.message : 'Errore caricamento resources'
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

    return items.filter((item) => {
      const matchesType = typeFilter === 'all' ? true : item.type === typeFilter
      if (!matchesType) {
        return false
      }

      if (normalizedQuery.length === 0) {
        return true
      }

      return [item.id, item.target ?? '', item.description ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [items, query, typeFilter])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Catalogo
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Resources</h2>
            <p className="mt-1 text-sm text-slate-600">
              Le ACL resource hanno lista tabellare e pagine dedicate di view/edit.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin/acl/resources/__new__')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Nuova risorsa
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Filtro testo
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca per id, target o descrizione"
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Type
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ResourceFilter)}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">Tutti</option>
              {ACL_RESOURCE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento resources...</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Id</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Access</th>
                  <th className="px-4 py-3 text-left">Managed</th>
                  <th className="px-4 py-3 text-left">Sync</th>
                  <th className="px-4 py-3 text-left">Target</th>
                  <th className="px-4 py-3 text-left">Permissions</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="bg-white">
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.id}</td>
                      <td className="px-4 py-3 text-slate-700">{item.type}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatAclResourceAccessMode(item.accessMode)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatAclResourceManagedBy(item.managedBy)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatAclResourceSyncState(item.syncState)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.target || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{item.permissionCount}</td>
                      <td className="px-4 py-3 text-slate-700">{item.description || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/admin/acl/resources/${encodeURIComponent(item.id)}`)
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/admin/acl/resources/${encodeURIComponent(item.id)}/edit`)
                            }
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
                    <td colSpan={9} className="px-4 py-10 text-sm text-slate-500">
                      {query.trim().length > 0 || typeFilter !== 'all'
                        ? 'Nessuna risorsa corrisponde ai filtri.'
                        : 'Nessuna risorsa configurata.'}
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
