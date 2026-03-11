import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { fetchAuthProviders } from '../features/auth/auth-api'
import type { AuthProviderItem } from '../features/auth/auth-types'
import { useAuth } from '../features/auth/useAuth'
import { useSetup } from '../features/setup/useSetup'

type LoginLocationState = {
  from?: string
  username?: string
}

const POST_LOGIN_REDIRECT_KEY = 'post-login-redirect'

function readStoredRedirectTarget(): string | null {
  const value = window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)?.trim() ?? ''
  return value ? value : null
}

function writeStoredRedirectTarget(value: string | null): void {
  if (!value) {
    window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
    return
  }

  window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, value)
}

export function LoginPage() {
  const { brandName } = useSetup()
  const { user, isBootstrapping, loginWithPassword } = useAuth()
  const location = useLocation()
  const state = location.state as LoginLocationState | undefined
  const searchParams = new URLSearchParams(location.search)
  const initialRedirect = state?.from && state.from !== '/login' ? state.from : null
  const redirectTo = initialRedirect ?? readStoredRedirectTarget() ?? '/'
  const prefilledUsername = state?.username?.trim() || searchParams.get('username')?.trim() || ''
  const [providers, setProviders] = useState<AuthProviderItem[]>([])
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providersError, setProvidersError] = useState<string | null>(null)
  const [username, setUsername] = useState(prefilledUsername)
  const [password, setPassword] = useState('')
  const [localLoginLoading, setLocalLoginLoading] = useState(false)
  const [localLoginError, setLocalLoginError] = useState<string | null>(null)

  useEffect(() => {
    if (initialRedirect) {
      writeStoredRedirectTarget(initialRedirect)
    }
  }, [initialRedirect])

  useEffect(() => {
    let cancelled = false

    void fetchAuthProviders()
      .then((payload) => {
        if (cancelled) {
          return
        }

        setProviders(payload.items ?? [])
        setProvidersError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento provider di accesso'
        setProviders([])
        setProvidersError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setProvidersLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const oidcProviders = useMemo(
    () => providers.filter((provider) => provider.type === 'oidc' && provider.loginPath),
    [providers],
  )
  const localProvider = useMemo(
    () => providers.find((provider) => provider.type === 'local'),
    [providers],
  )
  const authError = searchParams.get('authError')?.trim() || null
  const hasOidcProviders = oidcProviders.length > 0
  const localOnlyMode = Boolean(localProvider) && !providersLoading && !hasOidcProviders

  if (!isBootstrapping && user) {
    writeStoredRedirectTarget(null)
    return <Navigate replace to={redirectTo} />
  }

  const handleLocalLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalLoginError(null)
    setLocalLoginLoading(true)

    try {
      await loginWithPassword(username, password)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Login locale non riuscito. Riprova.'
      setLocalLoginError(message)
    } finally {
      setLocalLoginLoading(false)
    }
  }

  const startOidcLogin = (provider: AuthProviderItem) => {
    if (!provider.loginPath) {
      return
    }

    writeStoredRedirectTarget(redirectTo === '/login' ? '/' : redirectTo)
    window.location.assign(provider.loginPath)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#cffafe_0%,_#f8fafc_45%,_#ffffff_100%)] px-6 py-12 text-slate-900">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-[0_24px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-sm">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            {brandName}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Accedi al portale
          </h1>
          <p className="text-sm text-slate-600">
            {localOnlyMode
              ? 'Usa le credenziali locali create durante il setup o provisionate dal backoffice.'
              : 'Usa un provider federato oppure le credenziali locali abilitate.'}
          </p>
        </header>

        <div className="mt-6 space-y-6">
          {isBootstrapping ? (
            <p className="text-center text-sm text-slate-600">
              Verifica sessione in corso...
            </p>
          ) : null}

          {authError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {authError}
            </p>
          ) : null}

          {providersError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {providersError}
            </p>
          ) : null}

          <section className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Credenziali locali
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Username e password</h2>
            </div>

            {localProvider ? (
              <form className="space-y-4" onSubmit={(event) => void handleLocalLogin(event)}>
                {localOnlyMode ? (
                  <p className="text-sm text-slate-600">
                    Primo accesso: usa l&apos;email admin configurata durante il setup.
                  </p>
                ) : null}
                <label className="block text-sm font-medium text-slate-700">
                  Username
                  <input
                    type="email"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="nome.cognome@example.com"
                    autoComplete="username"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    autoComplete="current-password"
                  />
                </label>

                <button
                  type="submit"
                  disabled={localLoginLoading}
                  className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {localLoginLoading ? 'Accesso in corso...' : 'Accedi con password'}
                </button>

                {localLoginError ? (
                  <p className="text-sm text-rose-700">{localLoginError}</p>
                ) : null}
              </form>
            ) : (
              <p className="text-sm text-slate-500">
                Login locale non disponibile in questo ambiente.
              </p>
            )}
          </section>

          {providersLoading || hasOidcProviders || !localProvider ? (
            <section className="space-y-3 border-t border-slate-200 pt-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Provider federati
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">OIDC</h2>
              </div>

              {providersLoading ? (
                <p className="text-sm text-slate-600">Caricamento provider...</p>
              ) : hasOidcProviders ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {oidcProviders.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => startOidcLogin(provider)}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      Accedi con {provider.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Nessun provider OIDC disponibile in questo ambiente.
                </p>
              )}
            </section>
          ) : null}
        </div>
      </section>
    </main>
  )
}
