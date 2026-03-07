import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { AvailableApp, AvailableAppEntity } from '../features/apps/app-types'
import { useAdminNavigation } from './useAdminNavigation'
import { useRuntimeNavigation } from './useRuntimeNavigation'
import { useAuth } from '../features/auth/useAuth'

type RuntimeWorkspaceTopBarProps = {
  apps: AvailableApp[]
  selectedApp: AvailableApp | null
  selectedAppId: string | null
  selectedEntities: AvailableAppEntity[]
  loading: boolean
  error: string | null
  onSelectApp: (appId: string) => void
}

type AppTopBarProps = {
  runtimeWorkspace?: RuntimeWorkspaceTopBarProps
}

export function AppTopBar({ runtimeWorkspace }: AppTopBarProps) {
  const { user, isBootstrapping, logout } = useAuth()
  const { isAdminRoute, toggleSidebar } = useAdminNavigation()
  const { isRuntimeRoute, toggleDrawer } = useRuntimeNavigation()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const canAccessAdmin = Boolean(
    user?.permissions.some((permission) =>
      ['PORTAL_ADMIN', 'ADMIN', 'SUPERUSER'].includes(permission.trim().toUpperCase()),
    ),
  )
  const runtimeContext =
    Boolean(user) && isRuntimeRoute && !isAdminRoute ? runtimeWorkspace : undefined

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
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          {isAdminRoute ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 lg:hidden"
            >
              Menu
            </button>
          ) : null}

          {runtimeContext ? (
            <>
              <button
                type="button"
                onClick={toggleDrawer}
                className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 md:hidden"
              >
                Menu
              </button>
            </>
          ) : null}

          <Link
            to="/"
            className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700 transition hover:text-sky-800"
          >
            SFDC External
          </Link>

          {runtimeContext ? (
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-semibold text-slate-900">
                {runtimeContext.selectedApp?.label ??
                  (runtimeContext.loading ? 'Caricamento workspace...' : 'Workspace')}
              </p>
              <p className="truncate text-xs text-slate-500">
                {runtimeContext.error
                  ? 'Launcher non disponibile'
                  : runtimeContext.selectedApp?.description?.trim() ||
                    `${runtimeContext.selectedEntities.length} entity attive`}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {isBootstrapping ? (
            <span className="text-sm text-slate-500">Sessione...</span>
          ) : null}

          {!isBootstrapping && user ? (
            <>
              <span className="hidden text-sm text-slate-600 sm:inline">{user.email}</span>
              {canAccessAdmin ? (
                <Link
                  to="/admin/entity-config"
                  className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
                >
                  Admin Config
                </Link>
              ) : null}
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
