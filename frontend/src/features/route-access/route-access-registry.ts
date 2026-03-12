import {
  buildAuthAdminProvidersPath,
} from '../auth-admin/auth-admin-utils'
import { buildAuditListPath, buildAuditSearch } from '../audit-admin/audit-admin-utils'
import { buildAppsAdminListPath } from '../apps-admin/apps-admin-utils'
import { buildEntityCatalogPath } from '../entities-admin/entity-admin-routing'
import { buildMetadataAdminPath } from '../metadata-admin/metadata-admin-utils'
import { buildQueryTemplateListPath } from '../query-template-admin/query-template-admin-utils'

import type { AdminRouteId, KnownRouteDefinition, KnownRouteId } from './route-access-types'

export const HOME_ROUTE_ID: KnownRouteId = 'route:home'
export const ADMIN_AUTH_ROUTE_ID: AdminRouteId = 'route:admin-auth'
export const ADMIN_ENTITY_CONFIG_ROUTE_ID: AdminRouteId = 'route:admin-entity-config'
export const ADMIN_APPS_ROUTE_ID: AdminRouteId = 'route:admin-apps'
export const ADMIN_ACL_ROUTE_ID: AdminRouteId = 'route:admin-acl'
export const ADMIN_QUERY_TEMPLATES_ROUTE_ID: AdminRouteId = 'route:admin-query-templates'
export const ADMIN_VISIBILITY_ROUTE_ID: AdminRouteId = 'route:admin-visibility'
export const ADMIN_METADATA_ROUTE_ID: AdminRouteId = 'route:admin-metadata'
export const ADMIN_AUDIT_ROUTE_ID: AdminRouteId = 'route:admin-audit'

const KNOWN_ROUTE_DEFINITIONS: readonly KnownRouteDefinition[] = [
  {
    id: HOME_ROUTE_ID,
    path: '/',
    label: 'Home',
    description: 'Dashboard e launcher applicazioni.',
    isAdmin: false,
    sortOrder: 0,
  },
  {
    id: ADMIN_AUTH_ROUTE_ID,
    path: buildAuthAdminProvidersPath(),
    label: 'Auth',
    description: 'Provider di login e credenziali locali.',
    isAdmin: true,
    sortOrder: 5,
  },
  {
    id: ADMIN_ENTITY_CONFIG_ROUTE_ID,
    path: buildEntityCatalogPath(),
    label: 'Entity Config',
    description: 'Catalogo e sezioni di configurazione entity.',
    isAdmin: true,
    sortOrder: 10,
  },
  {
    id: ADMIN_APPS_ROUTE_ID,
    path: buildAppsAdminListPath(),
    label: 'Apps',
    description: 'Catalogo app e workspace items.',
    isAdmin: true,
    sortOrder: 20,
  },
  {
    id: ADMIN_ACL_ROUTE_ID,
    path: '/admin/acl/permissions',
    label: 'ACL',
    description: 'Permessi, defaults, assegnazioni Contact e risorse.',
    isAdmin: true,
    sortOrder: 30,
  },
  {
    id: ADMIN_QUERY_TEMPLATES_ROUTE_ID,
    path: buildQueryTemplateListPath(),
    label: 'Query Templates',
    description: 'Catalogo template query e relativo editor.',
    isAdmin: true,
    sortOrder: 40,
  },
  {
    id: ADMIN_VISIBILITY_ROUTE_ID,
    path: '/admin/visibility/cones',
    label: 'Visibility',
    description: 'Cones, rules, assignments e debug.',
    isAdmin: true,
    sortOrder: 50,
  },
  {
    id: ADMIN_METADATA_ROUTE_ID,
    path: buildMetadataAdminPath(),
    label: 'Metadata',
    description: 'Export, preview e deploy package zip versionabili.',
    isAdmin: true,
    sortOrder: 55,
  },
  {
    id: ADMIN_AUDIT_ROUTE_ID,
    path: `${buildAuditListPath()}${buildAuditSearch('security')}`,
    label: 'Audit',
    description: 'Stream read-only e dettaglio eventi.',
    isAdmin: true,
    sortOrder: 60,
  },
]

const ROUTE_DEFINITION_MAP = Object.fromEntries(
  KNOWN_ROUTE_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<KnownRouteId, KnownRouteDefinition>

export function isKnownRouteId(value: string): value is KnownRouteId {
  return Object.hasOwn(ROUTE_DEFINITION_MAP, value)
}

export function isAdminRouteId(value: KnownRouteId | string): value is AdminRouteId {
  return isKnownRouteId(value) && ROUTE_DEFINITION_MAP[value].isAdmin
}

export function getRouteDefinition(routeId: KnownRouteId): KnownRouteDefinition {
  return ROUTE_DEFINITION_MAP[routeId]
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
