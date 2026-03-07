import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { SessionUser } from '../../auth/auth-types'
import { normalizeEntityBasePath } from '../../entities/entity-helpers'
import { fetchAvailableApps } from '../app-api'
import type { AvailableApp } from '../app-types'
import {
  clearStoredAppSelection,
  readStoredAppSelection,
  writeStoredAppSelection,
} from '../app-selection-storage'

type AvailableAppsLauncherProps = {
  user: SessionUser
}

export function AvailableAppsLauncher({ user }: AvailableAppsLauncherProps) {
  const [apps, setApps] = useState<AvailableApp[]>([])
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchAvailableApps()
      .then((payload) => {
        if (cancelled) {
          return
        }

        const nextApps = payload.items ?? []
        const storedSelection = readStoredAppSelection()
        const storedApp =
          storedSelection?.userSub === user.sub
            ? nextApps.find((app) => app.id === storedSelection.appId) ?? null
            : null
        const nextSelectedApp = storedApp ?? nextApps[0] ?? null

        setApps(nextApps)
        setSelectedAppId(nextSelectedApp?.id ?? null)
        setPageError(null)

        if (nextSelectedApp) {
          writeStoredAppSelection({
            userSub: user.sub,
            appId: nextSelectedApp.id,
          })
        } else {
          clearStoredAppSelection()
        }
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento app disponibili'
        setApps([])
        setSelectedAppId(null)
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
  }, [user.sub])

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedAppId) ?? null,
    [apps, selectedAppId],
  )

  const selectApp = (appId: string) => {
    setSelectedAppId(appId)
    writeStoredAppSelection({
      userSub: user.sub,
      appId,
    })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
          Launcher
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">Le tue app</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Le app disponibili dipendono dai permission code effettivi della sessione. La selezione
          corrente viene salvata per utente nel browser.
        </p>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento app disponibili...</p>
      ) : apps.length === 0 ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Nessuna app disponibile per i permessi correnti.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 lg:grid-cols-3">
            {apps.map((app) => {
              const isSelected = app.id === selectedAppId

              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => selectApp(app.id)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    isSelected
                      ? 'border-sky-400 bg-sky-50 shadow-[0_18px_40px_-28px_rgba(2,132,199,0.8)]'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-slate-950">{app.label}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{app.id}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isSelected
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {app.entities.length} entity
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-600">
                    {app.description?.trim() || 'Nessuna descrizione configurata.'}
                  </p>
                </button>
              )
            })}
          </div>

          {selectedApp ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    App selezionata
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">{selectedApp.label}</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {selectedApp.description?.trim() || 'Nessuna descrizione configurata.'}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-600">
                  {selectedApp.entities.length} entity disponibili
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedApp.entities.map((entity) => (
                  <Link
                    key={entity.id}
                    to={normalizeEntityBasePath(entity.id, entity.basePath)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4 transition hover:border-sky-300 hover:bg-sky-50/40"
                  >
                    <p className="text-base font-semibold text-slate-950">{entity.label}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                      {entity.id} · {entity.objectApiName}
                    </p>
                    <p className="mt-3 text-sm text-slate-600">
                      {entity.description?.trim() || 'Apri la lista configurata per questa entity.'}
                    </p>
                    <p className="mt-4 text-sm font-semibold text-sky-700">Apri entity</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
