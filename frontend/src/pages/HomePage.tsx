import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { getAppEntityBasePath } from '../features/apps/app-workspace-routing'
import { useAppWorkspace } from '../features/apps/useAppWorkspace'
import { GoogleSignInButton } from '../features/auth/components/GoogleSignInButton'
import { useAuth } from '../features/auth/useAuth'
import { fetchHealthCheck, type HealthCheckResponse } from '../lib/api'

export function HomePage() {
  const { user, isBootstrapping } = useAuth()
  const { error, loading, selectedApp, selectedEntities } = useAppWorkspace()
  const [health, setHealth] = useState<HealthCheckResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const payload = await fetchHealthCheck()
        setHealth(payload)
        setHealthError(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Health check failed'
        setHealthError(message)
        setHealth(null)
      }
    }

    void loadHealth()
  }, [])

  if (!isBootstrapping && user) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-200 bg-white/90 p-7 shadow-[0_28px_65px_-38px_rgba(15,23,42,0.42)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Active Workspace
          </p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                {selectedApp?.label ?? 'Dashboard'}
              </h1>
              <p className="mt-3 text-sm text-slate-600 sm:text-base">
                {selectedApp?.description?.trim() ||
                  'Il workspace segue l app selezionata e mostra solo le entity disponibili.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-72">
              <SummaryMetric
                label="Entity attive"
                value={loading ? '...' : String(selectedEntities.length)}
              />
              <SummaryMetric
                label="Sessione"
                value={user.email}
                tone="neutral"
              />
            </div>
          </div>
        </header>

        {error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm">
            Errore caricamento app disponibili: {error}
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
            <p className="text-sm text-slate-600">Caricamento dashboard app in corso...</p>
          </section>
        ) : null}

        {!loading && !error && !selectedApp ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-950">Nessuna app disponibile</h2>
            <p className="mt-2 text-sm text-amber-900/90">
              La sessione e valida, ma non ci sono app pubblicate per i permessi correnti.
            </p>
          </section>
        ) : null}

        {!loading && !error && selectedApp ? (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
              <article className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  App selezionata
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">{selectedApp.label}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {selectedApp.description?.trim() || 'Nessuna descrizione configurata.'}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
                  Quick Notes
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  Usa il launcher in alto per cambiare app. I tab nella seconda riga seguono solo
                  le entity del contesto attivo.
                </p>
              </article>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white/92 p-6 shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Entities
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">
                    Shortcut operativi
                  </h2>
                </div>
                <p className="text-sm font-medium text-slate-500">
                  {selectedEntities.length} disponibili
                </p>
              </div>

              {selectedEntities.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500">Questa app non espone entity runtime.</p>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {selectedEntities.map((entity) => (
                    <Link
                      key={entity.id}
                      to={getAppEntityBasePath(entity)}
                      className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-5 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_24px_55px_-38px_rgba(2,132,199,0.8)]"
                    >
                      <p className="text-base font-semibold text-slate-950">{entity.label}</p>
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                        {entity.id} · {entity.objectApiName}
                      </p>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {entity.description?.trim() ||
                          'Apri la list view base configurata per questa entity.'}
                      </p>
                      <p className="mt-5 text-sm font-semibold text-sky-700">Apri entity</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}

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
            SFDC External
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
                Apri la pagina di accesso o usa direttamente il bottone Google.
              </p>
              <div className="mt-4 flex flex-col gap-4">
                <Link
                  to="/login"
                  className="inline-flex w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Vai al login
                </Link>
                <GoogleSignInButton />
              </div>
            </>
          ) : null}
        </section>

        {!isBootstrapping && !user ? (
          <>
            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">
                Percorsi rapidi
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Apri direttamente alcune viste entita disponibili.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/s/account"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Apri lista Account
                </Link>
                <Link
                  to="/s/account/new"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Nuovo Account
                </Link>
              </div>
            </section>
          </>
        ) : null}

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

type SummaryMetricProps = {
  label: string
  value: string
  tone?: 'sky' | 'neutral'
}

function SummaryMetric({
  label,
  value,
  tone = 'sky',
}: SummaryMetricProps) {
  return (
    <article
      className={`rounded-2xl px-4 py-4 shadow-sm ${
        tone === 'sky' ? 'bg-sky-50 text-slate-950' : 'bg-slate-100 text-slate-950'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </article>
  )
}
