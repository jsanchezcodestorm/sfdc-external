import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppDialog } from '../../../components/app-dialog'
import {
  deleteAclContactPermission,
  fetchAclContactPermissions,
} from '../acl-admin-api'
import type { AclAdminContactPermissionSummary } from '../acl-admin-types'
import { formatAclDateTime } from '../acl-admin-utils'

export function AclContactPermissionsPage() {
  const { confirm } = useAppDialog()
  const navigate = useNavigate()
  const [items, setItems] = useState<AclAdminContactPermissionSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void fetchAclContactPermissions()
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

        const message =
          error instanceof Error ? error.message : 'Errore caricamento contact permissions'
        setItems([])
        setPageError(message)
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
      if (normalizedQuery.length === 0) {
        return true
      }

      return [item.contactId, ...item.permissionCodes]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [items, query])

  const removeContactPermissions = async (contactId: string) => {
    const confirmed = await confirm({
      title: 'Rimuovi assegnazioni ACL',
      description: `Rimuovere tutte le assegnazioni ACL esplicite per il contact ${contactId}?`,
      confirmLabel: 'Rimuovi',
      cancelLabel: 'Annulla',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    setDeletingContactId(contactId)
    setPageError(null)

    try {
      await deleteAclContactPermission(contactId)
      setItems((current) => current.filter((item) => item.contactId !== contactId))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore rimozione contact permissions'
      setPageError(message)
    } finally {
      setDeletingContactId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Catalogo
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Contact Permissions</h2>
            <p className="mt-1 text-sm text-slate-600">
              Assegnazioni ACL esplicite per Contact Salesforce, additive rispetto ai defaults.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin/acl/contact-permissions/__new__')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Nuova assegnazione
          </button>
        </div>

        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Filtro testo
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca per contactId o permission code"
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento contact permissions...</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Contact ID</th>
                  <th className="px-4 py-3 text-left">Explicit permissions</th>
                  <th className="px-4 py-3 text-left">Count</th>
                  <th className="px-4 py-3 text-left">Updated</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <tr key={item.contactId} className="bg-white">
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">
                        {item.contactId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {item.permissionCodes.map((permissionCode) => (
                            <span
                              key={`${item.contactId}-${permissionCode}`}
                              className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800"
                            >
                              {permissionCode}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.permissionCount}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatAclDateTime(item.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/admin/acl/contact-permissions/${encodeURIComponent(item.contactId)}/edit`,
                              )
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void removeContactPermissions(item.contactId)
                            }}
                            disabled={deletingContactId === item.contactId}
                            className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-65"
                          >
                            {deletingContactId === item.contactId ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-sm text-slate-500">
                      {query.trim().length > 0
                        ? 'Nessuna assegnazione ACL corrisponde ai filtri.'
                        : 'Nessuna assegnazione ACL esplicita configurata.'}
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
