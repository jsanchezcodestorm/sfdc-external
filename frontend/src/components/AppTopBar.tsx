import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'

export function AppTopBar() {
  const { user, isBootstrapping, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setLogoutError(null)

    try {
      await logout()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout fallito'
      setLogoutError(message)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700 transition hover:text-sky-800"
        >
          SFDC External
        </Link>

        <div className="flex items-center gap-3">
          {isBootstrapping ? (
            <span className="text-sm text-slate-500">Sessione...</span>
          ) : null}

          {!isBootstrapping && user ? (
            <>
              <span className="hidden text-sm text-slate-600 sm:inline">{user.email}</span>
              <button
                type="button"
                onClick={() => {
                  void handleLogout()
                }}
                disabled={isLoggingOut}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isLoggingOut ? 'Disconnessione...' : 'Logout'}
              </button>
            </>
          ) : null}

          {!isBootstrapping && !user ? (
            <Link
              to="/login"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Login
            </Link>
          ) : null}
        </div>
      </div>

      {logoutError ? (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700 sm:px-6">
          Errore logout: {logoutError}
        </div>
      ) : null}
    </header>
  )
}
