import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { fetchAuthAdminProviders } from '../auth-admin-api'
import type { AuthAdminProviderItem } from '../auth-admin-types'
import {
  buildAuthAdminProviderCreatePath,
  buildAuthAdminProviderEditPath,
} from '../auth-admin-utils'

export function AuthAdminProvidersPage() {
  const [items, setItems] = useState<AuthAdminProviderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchAuthAdminProviders()
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
          error instanceof Error ? error.message : 'Errore caricamento provider auth'
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

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label),
      ),
    [items],
  )

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Backoffice Auth
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Providers</h2>
          <p className="mt-1 text-sm text-slate-600">
            Configurazione OIDC persistita a database. Apri una pagina dedicata per configurare o
            modificare ogni provider.
          </p>
        </div>

        <Link
          to={buildAuthAdminProviderCreatePath()}
          className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Configura provider
        </Link>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento provider...</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Provider</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Secret</th>
                  <th className="px-4 py-3 text-left">Issuer / accesso</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedItems.map((item) => (
                  <tr key={item.id} className="bg-white align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.providerFamily}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.hasClientSecret ? 'Configurato' : 'Assente'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {item.issuer || item.loginPath || 'Provider locale'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={buildAuthAdminProviderEditPath(item.id)}
                        className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        {item.status === 'not_configured' ? 'Configura' : 'Modifica'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function StatusBadge({
  status,
}: {
  status: AuthAdminProviderItem['status']
}) {
  const className =
    status === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'disabled'
        ? 'border-slate-200 bg-slate-100 text-slate-700'
        : status === 'not_configured'
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${className}`}
    >
      {status}
    </span>
  )
}
