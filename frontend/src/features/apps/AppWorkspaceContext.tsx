import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from '../auth/useAuth'
import { fetchAvailableApps } from './app-api'
import {
  clearStoredAppSelection,
  readStoredAppSelection,
  writeStoredAppSelection,
} from './app-selection-storage'
import type { AvailableApp, AvailableAppEntity } from './app-types'
import { AppWorkspaceContext, type AppWorkspaceContextValue } from './app-workspace-context'

type AppWorkspaceProviderProps = {
  children: ReactNode
  enabled?: boolean
}

function resetWorkspaceState(
  setApps: (value: AvailableApp[]) => void,
  setSelectedAppId: (value: string | null) => void,
  setError: (value: string | null) => void,
  setLoadedUserSub: (value: string | null) => void,
) {
  setApps([])
  setSelectedAppId(null)
  setError(null)
  setLoadedUserSub(null)
}

export function AppWorkspaceProvider({
  children,
  enabled = true,
}: AppWorkspaceProviderProps) {
  const { user, isBootstrapping } = useAuth()
  const [apps, setApps] = useState<AvailableApp[]>([])
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedUserSub, setLoadedUserSub] = useState<string | null>(null)

  useEffect(() => {
    if (isBootstrapping) {
      return
    }

    if (user) {
      return
    }

    clearStoredAppSelection()
    resetWorkspaceState(setApps, setSelectedAppId, setError, setLoadedUserSub)
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

        const nextApps = payload.items ?? []
        const storedSelection = readStoredAppSelection()
        const storedApp =
          storedSelection?.userSub === user.sub
            ? nextApps.find((app) => app.id === storedSelection.appId) ?? null
            : null
        const nextSelectedApp = storedApp ?? nextApps[0] ?? null

        setApps(nextApps)
        setSelectedAppId(nextSelectedApp?.id ?? null)
        setError(null)
        setLoadedUserSub(user.sub)

        if (nextSelectedApp) {
          writeStoredAppSelection({
            userSub: user.sub,
            appId: nextSelectedApp.id,
          })
          return
        }

        clearStoredAppSelection()
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
        setSelectedAppId(null)
        setError(message)
        setLoadedUserSub(user.sub)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, isBootstrapping, loadedUserSub, user])

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedAppId) ?? null,
    [apps, selectedAppId],
  )

  const selectedEntities = useMemo<AvailableAppEntity[]>(
    () => selectedApp?.entities ?? [],
    [selectedApp],
  )
  const loading = !isBootstrapping && Boolean(user) && enabled && loadedUserSub !== user?.sub

  const value = useMemo<AppWorkspaceContextValue>(
    () => ({
      apps,
      selectedApp,
      selectedAppId,
      selectedEntities,
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

        setSelectedAppId(nextApp.id)
        writeStoredAppSelection({
          userSub: user.sub,
          appId: nextApp.id,
        })
      },
    }),
    [apps, error, loading, selectedApp, selectedAppId, selectedEntities, user],
  )

  return <AppWorkspaceContext.Provider value={value}>{children}</AppWorkspaceContext.Provider>
}
