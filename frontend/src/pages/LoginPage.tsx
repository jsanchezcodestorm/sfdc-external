import { Navigate, useLocation } from 'react-router-dom'

import { GoogleSignInButton } from '../features/auth/components/GoogleSignInButton'
import { useAuth } from '../features/auth/useAuth'
import { useSetup } from '../features/setup/useSetup'

type LoginLocationState = {
  from?: string
}

export function LoginPage() {
  const { brandName } = useSetup()
  const { user, isBootstrapping } = useAuth()
  const location = useLocation()
  const state = location.state as LoginLocationState | undefined
  const redirectTo = state?.from && state.from !== '/login' ? state.from : '/'

  if (!isBootstrapping && user) {
    return <Navigate replace to={redirectTo} />
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#cffafe_0%,_#f8fafc_45%,_#ffffff_100%)] px-6 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-[0_24px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur-sm">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            {brandName}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Accedi con Google
          </h1>
          <p className="text-sm text-slate-600">
            Effettua il login per iniziare a usare il portale.
          </p>
        </header>

        <div className="mt-6">
          {isBootstrapping ? (
            <p className="text-center text-sm text-slate-600">
              Verifica sessione in corso...
            </p>
          ) : (
            <GoogleSignInButton />
          )}
        </div>
      </section>
    </main>
  )
}
