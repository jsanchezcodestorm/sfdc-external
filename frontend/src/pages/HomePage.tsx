import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AvailableAppsLauncher } from '../features/apps/components/AvailableAppsLauncher'
import { buildAppHomePath } from '../features/apps/app-workspace-routing'
import { useAppWorkspace } from '../features/apps/useAppWorkspace'
import { useAuth } from '../features/auth/useAuth'
import { useSetup } from '../features/setup/useSetup'
import { fetchHealthCheck, type HealthCheckResponse } from '../lib/api'

export function HomePage() {
  const navigate = useNavigate()
  const { brandName } = useSetup()
  const { user, isBootstrapping } = useAuth()
  const { apps, error, loading, selectedApp, selectedAppId, selectApp } = useAppWorkspace()
  const [health, setHealth] = useState<HealthCheckResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const payload = await fetchHealthCheck()
        setHealth(payload)
        setHealthError(null)
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Health check failed'
        setHealthError(message)
        setHealth(null)
      }
    }

    void loadHealth()
  }, [])

  if (!isBootstrapping && user) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="rounded-3xl border border-slate-200 bg-white/90 p-7 shadow-[0_28px_65px_-38px_rgba(15,23,42,0.42)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            App Launcher
          </p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                {selectedApp?.label ?? 'Workspace'}
              </h1>
              <p className="mt-3 text-sm text-slate-600 sm:text-base">
                {selectedApp?.description?.trim() ||
                  'Seleziona un app dal launcher per aprire la sua home e la relativa navigazione interna.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-72">
              <SummaryMetric
                label="App visibili"
                value={loading ? '...' : String(apps.length)}
              />
              <SummaryMetric
                label="Sessione"
                value={user.email}
                tone="neutral"
              />
            </div>
          </div>
        </header>

        {selectedApp ? (
          <section className="rounded-3xl border border-slate-200 bg-white/92 p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  App selezionata
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">{selectedApp.label}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedApp.description?.trim() || 'Nessuna descrizione configurata.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(buildAppHomePath(selectedApp.id))}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Apri home app
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white/92 p-6 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Apps
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                Catalogo disponibile
              </h2>
            </div>
            <p className="text-sm font-medium text-slate-500">
              {loading ? '...' : `${apps.length} disponibili`}
            </p>
          </div>

          <div className="mt-5">
            <AvailableAppsLauncher
              apps={apps}
              selectedAppId={selectedAppId}
              loading={loading}
              error={error}
              onSelectApp={(appId) => {
                selectApp(appId)
                navigate(buildAppHomePath(appId))
              }}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">
            Stato servizio
          </h2>
          {health && !healthError ? (
            <p className="mt-2 text-sm text-emerald-700">
              Servizio online ({health.status}) - {health.timestamp}
            </p>
          ) : null}
          {!health && !healthError ? (
            <p className="mt-2 text-sm text-slate-600">Verifica stato in corso...</p>
          ) : null}
          {healthError ? (
            <p className="mt-2 text-sm text-rose-700">Errore verifica stato: {healthError}</p>
          ) : null}
        </section>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#e0f2fe_0%,_#f8fafc_45%,_#ffffff_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-3xl border border-sky-100 bg-white/85 p-8 shadow-[0_24px_50px_-28px_rgba(2,132,199,0.55)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            {brandName}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Workspace Launcher
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
            Portale per accedere alle applicazioni e ai flussi disponibili.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">
            Sessione
          </h2>

          {isBootstrapping ? (
            <p className="mt-2 text-sm text-slate-600">
              Verifica sessione in corso...
            </p>
          ) : null}

          {!isBootstrapping && user ? (
            <>
              <p className="mt-2 text-sm text-emerald-700">
                Autenticato come <strong>{user.email}</strong>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Permessi iniziali: {user.permissions.length}
              </p>
            </>
          ) : null}

          {!isBootstrapping && !user ? (
            <>
              <p className="mt-2 text-sm text-slate-600">
                Nessuna sessione attiva.
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Apri la pagina di accesso per scegliere il provider disponibile.
              </p>
              <div className="mt-4 flex flex-col gap-4">
                <Link
                  to="/login"
                  className="inline-flex w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Vai al login
                </Link>
              </div>
            </>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">
            Stato servizio
          </h2>
          {health && !healthError && (
            <p className="mt-2 text-sm text-emerald-700">
              Servizio online ({health.status}) - {health.timestamp}
            </p>
          )}
          {!health && !healthError && (
            <p className="mt-2 text-sm text-slate-600">Verifica stato in corso...</p>
          )}
          {healthError && (
            <p className="mt-2 text-sm text-rose-700">Errore verifica stato: {healthError}</p>
          )}
        </section>
      </div>
    </main>
  )
}

function SummaryMetric({
  label,
  value,
  tone = 'brand',
}: {
  label: string
  value: string
  tone?: 'brand' | 'neutral'
}) {
  return (
    <article
      className={`rounded-2xl px-4 py-4 ${
        tone === 'brand'
          ? 'border border-sky-100 bg-sky-50'
          : 'border border-slate-200 bg-slate-50'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-slate-950">{value}</p>
    </article>
  )
}
