import type {
  AdminRouteId as SharedAdminRouteId,
  KnownRouteDefinition as SharedKnownRouteDefinition,
  KnownRouteId as SharedKnownRouteId,
} from '@sfdc-external/shared'

export type NavigationRouteItem = {
  id: string
  target?: string
  description?: string
}

export type NavigationRoutesResponse = {
  items: NavigationRouteItem[]
}

export type KnownRouteId = SharedKnownRouteId

export type AdminRouteId = SharedAdminRouteId

export type KnownRouteDefinition = SharedKnownRouteDefinition
