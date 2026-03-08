import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { useAuth } from '../auth/useAuth'

import { fetchRouteAccessNavigation } from './route-access-api'
import {
  getAllowedAdminRouteIds,
  getAllowedKnownRouteIds,
  getFirstAllowedAdminPath,
  getFirstAllowedAdminRouteId,
} from './route-access-registry'
import { RouteAccessContext, type RouteAccessContextValue } from './route-access-context'
import type { KnownRouteId } from './route-access-types'

type RouteAccessProviderProps = {
  children: ReactNode
}

function resetRouteAccessState(
  setAllowedRouteIds: (value: KnownRouteId[]) => void,
  setError: (value: string | null) => void,
  setLoadedUserSub: (value: string | null) => void,
) {
  setAllowedRouteIds([])
  setError(null)
  setLoadedUserSub(null)
}

export function RouteAccessProvider({ children }: RouteAccessProviderProps) {
  const { user, isBootstrapping } = useAuth()
  const [allowedRouteIds, setAllowedRouteIds] = useState<KnownRouteId[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadedUserSub, setLoadedUserSub] = useState<string | null>(null)

  useEffect(() => {
    if (isBootstrapping) {
      return
    }

    if (user) {
      return
    }

    resetRouteAccessState(setAllowedRouteIds, setError, setLoadedUserSub)
  }, [isBootstrapping, user])

  useEffect(() => {
    if (isBootstrapping || !user) {
      return
    }

    if (loadedUserSub === user.sub) {
      return
    }

    let cancelled = false

    void fetchRouteAccessNavigation()
      .then((payload) => {
        if (cancelled) {
          return
        }

        const nextAllowedRouteIds = getAllowedKnownRouteIds(
          (payload.items ?? []).map((item) => item.id),
        )

        setAllowedRouteIds(nextAllowedRouteIds)
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
            : 'Errore durante la verifica route ACL'

        setAllowedRouteIds([])
        setError(message)
        setLoadedUserSub(user.sub)
      })

    return () => {
      cancelled = true
    }
  }, [isBootstrapping, loadedUserSub, user])

  const allowedAdminRouteIds = useMemo(
    () => getAllowedAdminRouteIds(loadedUserSub === user?.sub ? allowedRouteIds : []),
    [allowedRouteIds, loadedUserSub, user?.sub],
  )

  const effectiveAllowedRouteIds = useMemo(
    () => (loadedUserSub === user?.sub ? allowedRouteIds : []),
    [allowedRouteIds, loadedUserSub, user?.sub],
  )

  const firstAllowedAdminRouteId = useMemo(
    () => getFirstAllowedAdminRouteId(effectiveAllowedRouteIds),
    [effectiveAllowedRouteIds],
  )

  const firstAllowedAdminPath = useMemo(
    () => getFirstAllowedAdminPath(effectiveAllowedRouteIds),
    [effectiveAllowedRouteIds],
  )

  const allowedRouteIdSet = useMemo(
    () => new Set<string>(effectiveAllowedRouteIds),
    [effectiveAllowedRouteIds],
  )

  const isLoading = !isBootstrapping && Boolean(user) && loadedUserSub !== user?.sub
  const effectiveError = loadedUserSub === user?.sub ? error : null

  const value = useMemo<RouteAccessContextValue>(
    () => ({
      allowedRouteIds: effectiveAllowedRouteIds,
      allowedAdminRouteIds,
      firstAllowedAdminRouteId,
      firstAllowedAdminPath,
      hasRoute: (routeId: string) => allowedRouteIdSet.has(routeId),
      isLoading,
      error: effectiveError,
    }),
    [
      allowedAdminRouteIds,
      allowedRouteIdSet,
      effectiveAllowedRouteIds,
      effectiveError,
      firstAllowedAdminPath,
      firstAllowedAdminRouteId,
      isLoading,
    ],
  )

  return <RouteAccessContext.Provider value={value}>{children}</RouteAccessContext.Provider>
}
