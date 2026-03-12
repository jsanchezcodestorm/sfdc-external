import * as routeCatalog from '@sfdc-external/shared'

import type { AdminRouteId, KnownRouteDefinition, KnownRouteId } from './route-access-types'

export {
  ADMIN_ACL_ROUTE_ID,
  ADMIN_APPS_ROUTE_ID,
  ADMIN_AUDIT_ROUTE_ID,
  ADMIN_AUTH_ROUTE_ID,
  ADMIN_ENTITY_CONFIG_ROUTE_ID,
  ADMIN_METADATA_ROUTE_ID,
  ADMIN_QUERY_TEMPLATES_ROUTE_ID,
  ADMIN_VISIBILITY_ROUTE_ID,
  HOME_ROUTE_ID,
}

export { isAdminRouteId, isKnownRouteId }

const {
  ADMIN_ACL_ROUTE_ID,
  ADMIN_APPS_ROUTE_ID,
  ADMIN_AUDIT_ROUTE_ID,
  ADMIN_AUTH_ROUTE_ID,
  ADMIN_ENTITY_CONFIG_ROUTE_ID,
  ADMIN_METADATA_ROUTE_ID,
  ADMIN_QUERY_TEMPLATES_ROUTE_ID,
  ADMIN_VISIBILITY_ROUTE_ID,
  HOME_ROUTE_ID,
  KNOWN_ROUTE_DEFINITION_BY_ID,
  KNOWN_ROUTE_DEFINITIONS,
  isAdminRouteId,
  isKnownRouteId,
} = routeCatalog

export function getRouteDefinition(routeId: KnownRouteId): KnownRouteDefinition {
  return KNOWN_ROUTE_DEFINITION_BY_ID[routeId]
}

export function getAllowedKnownRouteIds(routeIds: readonly string[]): KnownRouteId[] {
  const allowedSet = new Set(routeIds.filter(isKnownRouteId))

  return KNOWN_ROUTE_DEFINITIONS
    .map((definition) => definition.id)
    .filter((routeId) => allowedSet.has(routeId))
}

export function getAllowedAdminRouteIds(routeIds: readonly string[]): AdminRouteId[] {
  return getAllowedKnownRouteIds(routeIds).filter(isAdminRouteId)
}

export function getFirstAllowedAdminRouteId(routeIds: readonly string[]): AdminRouteId | null {
  return getAllowedAdminRouteIds(routeIds)[0] ?? null
}

export function getFirstAllowedAdminPath(routeIds: readonly string[]): string | null {
  const routeId = getFirstAllowedAdminRouteId(routeIds)
  return routeId ? getRouteDefinition(routeId).path : null
}

export function getAllowedRouteDestinations(routeIds: readonly string[]): KnownRouteDefinition[] {
  return getAllowedKnownRouteIds(routeIds).map((routeId) => getRouteDefinition(routeId))
}
