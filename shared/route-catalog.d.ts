export type KnownRouteId =
  | 'route:home'
  | 'route:admin-auth'
  | 'route:admin-entity-config'
  | 'route:admin-apps'
  | 'route:admin-acl'
  | 'route:admin-query-templates'
  | 'route:admin-visibility'
  | 'route:admin-metadata'
  | 'route:admin-audit';

export type AdminRouteId = Exclude<KnownRouteId, 'route:home'>;

export type KnownRouteDefinition = {
  id: KnownRouteId;
  path: string;
  label: string;
  description: string;
  isAdmin: boolean;
  sortOrder: number;
};

export const HOME_ROUTE_ID: KnownRouteId;
export const ADMIN_AUTH_ROUTE_ID: AdminRouteId;
export const ADMIN_ENTITY_CONFIG_ROUTE_ID: AdminRouteId;
export const ADMIN_APPS_ROUTE_ID: AdminRouteId;
export const ADMIN_ACL_ROUTE_ID: AdminRouteId;
export const ADMIN_QUERY_TEMPLATES_ROUTE_ID: AdminRouteId;
export const ADMIN_VISIBILITY_ROUTE_ID: AdminRouteId;
export const ADMIN_METADATA_ROUTE_ID: AdminRouteId;
export const ADMIN_AUDIT_ROUTE_ID: AdminRouteId;

export const KNOWN_ROUTE_DEFINITIONS: readonly KnownRouteDefinition[];
export const KNOWN_ROUTE_DEFINITION_BY_ID: Readonly<Record<KnownRouteId, KnownRouteDefinition>>;

export function isKnownRouteId(value: string): value is KnownRouteId;
export function isAdminRouteId(value: string): value is AdminRouteId;
