import { useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { AdminNavigationProvider } from './AdminNavigationContext'
import { AppWorkspaceShell } from './AppWorkspaceShell'
import { AppTopBar } from './AppTopBar'
import { RuntimeNavigationProvider } from './RuntimeNavigationContext'
import {
  resolveAppSelectionNavigationTarget,
} from '../features/apps/app-workspace-routing'
import { AppWorkspaceProvider } from '../features/apps/AppWorkspaceContext'
import { useAppWorkspace } from '../features/apps/useAppWorkspace'
import { useAuth } from '../features/auth/useAuth'

function isRuntimeWorkspacePath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/s/')
}

export function AppShell() {
  const location = useLocation()
  const { user } = useAuth()
  const isRuntimeRoute = isRuntimeWorkspacePath(location.pathname)

  return (
    <AdminNavigationProvider>
      <RuntimeNavigationProvider>
        <AppWorkspaceProvider enabled={Boolean(user) && isRuntimeRoute}>
          <AppShellLayout isRuntimeRoute={isRuntimeRoute} />
        </AppWorkspaceProvider>
      </RuntimeNavigationProvider>
    </AdminNavigationProvider>
  )
}

function AppShellLayout({ isRuntimeRoute }: { isRuntimeRoute: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { apps, error, loading, selectApp, selectedApp, selectedAppId, selectedEntities } =
    useAppWorkspace()

  const isRuntimeWorkspaceActive = Boolean(user) && isRuntimeRoute

  const handleSelectApp = useCallback(
    (appId: string) => {
      const nextApp = apps.find((app) => app.id === appId) ?? null
      if (!nextApp || nextApp.id === selectedAppId) {
        return
      }

      selectApp(nextApp.id)

      const nextTarget = resolveAppSelectionNavigationTarget({
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        nextApp,
      })
      const currentTarget = `${location.pathname}${location.search}${location.hash}`

      if (nextTarget !== currentTarget) {
        navigate(nextTarget)
      }
    },
    [apps, location.hash, location.pathname, location.search, navigate, selectApp, selectedAppId],
  )

  return (
    <>
      <AppTopBar
        runtimeWorkspace={
          isRuntimeWorkspaceActive
            ? {
                apps,
                error,
                loading,
                onSelectApp: handleSelectApp,
                selectedApp,
                selectedAppId,
                selectedEntities,
              }
            : undefined
        }
      />

      {isRuntimeWorkspaceActive ? (
        <AppWorkspaceShell onSelectApp={handleSelectApp}>
          <Outlet />
        </AppWorkspaceShell>
      ) : (
        <Outlet />
      )}
    </>
  )
}
