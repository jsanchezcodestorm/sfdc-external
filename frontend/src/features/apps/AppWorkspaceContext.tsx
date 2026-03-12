import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { fetchAvailableApps } from './app-api'
import {
  clearStoredAppSelection,
  readStoredAppSelection,
  writeStoredAppSelection,
} from './app-selection-storage'
import type { AvailableApp, AvailableAppEntityItem, AvailableAppHomeItem, AvailableAppItem } from './app-types'
import { AppWorkspaceContext, type AppWorkspaceContextValue } from './app-workspace-context'
import { extractAppIdFromPathname, getEntityItems, getHomeItem } from './app-workspace-routing'

type AppWorkspaceProviderProps = {
  children: ReactNode
  enabled?: boolean
}

function resetWorkspaceState(
  setApps: (value: AvailableApp[]) => void,
  setError: (value: string | null) => void,
  setLoadedUserSub: (value: string | null) => void,
) {
  setApps([])
  setError(null)
  setLoadedUserSub(null)
}

export function AppWorkspaceProvider({
  children,
  enabled = true,
}: AppWorkspaceProviderProps) {
  const location = useLocation()
  const { user, isBootstrapping } = useAuth()
  const [apps, setApps] = useState<AvailableApp[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadedUserSub, setLoadedUserSub] = useState<string | null>(null)
  const routeAppId = enabled ? extractAppIdFromPathname(location.pathname) : null

  useEffect(() => {
    if (isBootstrapping) {
      return
    }

    if (user) {
      return
    }

    clearStoredAppSelection()
    resetWorkspaceState(setApps, setError, setLoadedUserSub)
  }, [isBootstrapping, user])

  useEffect(() => {
    if (isBootstrapping || !user || !enabled) {
      return
    }

    if (loadedUserSub === user.sub) {
      return
    }

    let cancelled = false

    void fetchAvailableApps()
      .then((payload) => {
        if (cancelled) {
          return
        }

        setApps(payload.items ?? [])
        setError(null)
        setLoadedUserSub(user.sub)
      })
      .catch((loadError) => {
        if (cancelled) {
          return
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Errore caricamento app disponibili'

        setApps([])
        setError(message)
        setLoadedUserSub(user.sub)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, isBootstrapping, loadedUserSub, routeAppId, user])

  const persistedAppId = useMemo(() => {
    if (!user) {
      return null
    }

    const storedSelection = readStoredAppSelection()
    const storedApp =
      storedSelection?.userSub === user.sub
        ? apps.find((app) => app.id === storedSelection.appId) ?? null
        : null
    const routeApp = routeAppId ? apps.find((app) => app.id === routeAppId) ?? null : null

    return routeApp?.id ?? storedApp?.id ?? apps[0]?.id ?? null
  }, [apps, routeAppId, user])

  useEffect(() => {
    if (!user) {
      return
    }

    if (persistedAppId) {
      writeStoredAppSelection({
        userSub: user.sub,
        appId: persistedAppId,
      })
    } else {
      clearStoredAppSelection()
    }
  }, [persistedAppId, user])

  const selectedAppId = routeAppId ?? persistedAppId

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedAppId) ?? null,
    [apps, selectedAppId],
  )

  const selectedItems = useMemo<AvailableAppItem[]>(
    () => selectedApp?.items ?? [],
    [selectedApp],
  )
  const selectedEntities = useMemo<AvailableAppEntityItem[]>(
    () => getEntityItems(selectedApp),
    [selectedApp],
  )
  const homeItem = useMemo<AvailableAppHomeItem | null>(
    () => getHomeItem(selectedApp),
    [selectedApp],
  )
  const loading = !isBootstrapping && Boolean(user) && enabled && loadedUserSub !== user?.sub

  const value = useMemo<AppWorkspaceContextValue>(
    () => ({
      apps,
      selectedApp,
      selectedAppId,
      selectedItems,
      selectedEntities,
      homeItem,
      loading,
      error,
      selectApp: (appId: string) => {
        if (!user) {
          return
        }

        const nextApp = apps.find((app) => app.id === appId) ?? null
        if (!nextApp) {
          return
        }

        writeStoredAppSelection({
          userSub: user.sub,
          appId: nextApp.id,
        })
      },
    }),
    [apps, error, homeItem, loading, selectedApp, selectedAppId, selectedEntities, selectedItems, user],
  )

  return <AppWorkspaceContext.Provider value={value}>{children}</AppWorkspaceContext.Provider>
}
