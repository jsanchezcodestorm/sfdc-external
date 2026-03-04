import { useEffect, useState } from 'react'

import { fetchHealthCheck, type HealthCheckResponse } from './lib/api'

const stack = [
  {
    title: 'React 19',
    description: 'Component model and state management for the UI shell.',
  },
  {
    title: 'Vite 7',
    description: 'Fast local server, HMR, and optimized production builds.',
  },
  {
    title: 'TypeScript 5',
    description: 'Strict typing enabled by default in app and tooling configs.',
  },
  {
    title: 'Tailwind 4',
    description: 'Utility-first styling with zero custom PostCSS boilerplate.',
  },
]

function App() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#e0f2fe_0%,_#f8fafc_45%,_#ffffff_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-3xl border border-sky-100 bg-white/85 p-8 shadow-[0_24px_50px_-28px_rgba(2,132,199,0.55)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            SFDC External
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Frontend Base Stack
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
            Frontend pronto per integrare API backend NestJS tramite cookie
            session (`credentials: "include"`), senza accesso diretto a
            Salesforce dal client.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {stack.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-slate-900">
                {item.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-slate-950 p-5 text-slate-100 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-300">
            API Pattern
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Base URL attiva: <code className="font-mono">{apiBaseUrl}</code>
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-black/35 p-4 text-xs text-slate-200">
            <code>{`await apiFetch('/query', {
  method: 'POST',
  body: { templateId: 'account.pipeline' },
})`}</code>
          </pre>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">
            Backend Health Check
          </h2>
          {health && !healthError && (
            <p className="mt-2 text-sm text-emerald-700">
              Backend online ({health.status}) - {health.timestamp}
            </p>
          )}
          {!health && !healthError && (
            <p className="mt-2 text-sm text-slate-600">Verifica stato backend in corso...</p>
          )}
          {healthError && (
            <p className="mt-2 text-sm text-rose-700">Errore health check: {healthError}</p>
          )}
        </section>
      </div>
    </main>
  )
}

export default App
