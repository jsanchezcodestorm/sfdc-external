import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { AvailableAppsLauncher } from '../features/apps/components/AvailableAppsLauncher'
import { clearStoredAppSelection } from '../features/apps/app-selection-storage'
import { GoogleSignInButton } from '../features/auth/components/GoogleSignInButton'
import { useAuth } from '../features/auth/useAuth'
import { fetchHealthCheck, type HealthCheckResponse } from '../lib/api'

export function HomePage() {
  const { user, isBootstrapping } = useAuth()
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

  useEffect(() => {
    if (!isBootstrapping && !user) {
      clearStoredAppSelection()
    }
  }, [isBootstrapping, user])

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

        {!isBootstrapping && user ? <AvailableAppsLauncher key={user.sub} user={user} /> : null}

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
