import { useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { AdminNavigationProvider } from './AdminNavigationContext'
import { AppWorkspaceShell } from './AppWorkspaceShell'
import { AppTopBar } from './AppTopBar'
import { RuntimeNavigationProvider } from './RuntimeNavigationContext'
import {
  isAppRuntimePath,
  resolveAppSelectionNavigationTarget,
} from '../features/apps/app-workspace-routing'
import { AppWorkspaceProvider } from '../features/apps/AppWorkspaceContext'
import { useAppWorkspace } from '../features/apps/useAppWorkspace'
import { useAuth } from '../features/auth/useAuth'
import { RouteAccessProvider } from '../features/route-access/RouteAccessContext'

function isWorkspaceDataPath(pathname: string): boolean {
  return pathname === '/' || isAppRuntimePath(pathname)
}

export function AppShell() {
  const location = useLocation()
  const { user } = useAuth()
  const isWorkspacePath = isWorkspaceDataPath(location.pathname)

  return (
    <RouteAccessProvider>
      <AdminNavigationProvider>
        <RuntimeNavigationProvider>
          <AppWorkspaceProvider enabled={Boolean(user) && isWorkspacePath}>
            <AppShellLayout />
          </AppWorkspaceProvider>
        </RuntimeNavigationProvider>
      </AdminNavigationProvider>
    </RouteAccessProvider>
  )
}

function AppShellLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    apps,
    error,
    loading,
    selectApp,
    selectedApp,
    selectedAppId,
    selectedEntities,
    selectedItems,
  } = useAppWorkspace()

  const isRuntimeWorkspaceActive = Boolean(user) && isAppRuntimePath(location.pathname)

  const handleSelectApp = useCallback(
    (appId: string) => {
      const nextApp = apps.find((app) => app.id === appId) ?? null
      if (!nextApp || nextApp.id === selectedAppId) {
        return
      }

      selectApp(nextApp.id)
      navigate(resolveAppSelectionNavigationTarget(nextApp))
    },
    [apps, navigate, selectApp, selectedAppId],
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
                selectedItems,
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
