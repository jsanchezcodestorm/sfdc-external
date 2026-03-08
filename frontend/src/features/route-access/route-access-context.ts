import { createContext } from 'react'

import type { AdminRouteId, KnownRouteId } from './route-access-types'

export type RouteAccessContextValue = {
  allowedRouteIds: KnownRouteId[]
  allowedAdminRouteIds: AdminRouteId[]
  firstAllowedAdminRouteId: AdminRouteId | null
  firstAllowedAdminPath: string | null
  hasRoute: (routeId: string) => boolean
  isLoading: boolean
  error: string | null
}

export const RouteAccessContext = createContext<RouteAccessContextValue | undefined>(undefined)
