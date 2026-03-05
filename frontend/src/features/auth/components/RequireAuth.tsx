import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../useAuth'

export function RequireAuth() {
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

  return <Outlet />
}
