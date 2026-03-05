import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../useAuth'

const ADMIN_PERMISSIONS = new Set(['PORTAL_ADMIN', 'ADMIN', 'SUPERUSER'])

export function RequireAdmin() {
  const { user, isBootstrapping } = useAuth()
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-700">
        Verifica sessione in corso...
      </main>
    )
  }

  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace to="/login" state={{ from }} />
  }

  const canAccessAdmin = user.permissions.some((permission) =>
    ADMIN_PERMISSIONS.has(permission.trim().toUpperCase()),
  )

  if (!canAccessAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Accesso negato</h1>
          <p className="mt-2 text-sm text-amber-900/90">
            Questa area e disponibile solo per utenti con permesso admin.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
          >
            Torna alla home
          </Link>
        </div>
      </main>
    )
  }

  return <Outlet />
}
