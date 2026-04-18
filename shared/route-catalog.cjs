const HOME_ROUTE_ID = 'route:home';
const ADMIN_AUTH_ROUTE_ID = 'route:admin-auth';
const ADMIN_ENTITY_CONFIG_ROUTE_ID = 'route:admin-entity-config';
const ADMIN_APPS_ROUTE_ID = 'route:admin-apps';
const ADMIN_ACL_ROUTE_ID = 'route:admin-acl';
const ADMIN_QUERY_TEMPLATES_ROUTE_ID = 'route:admin-query-templates';
const ADMIN_VISIBILITY_ROUTE_ID = 'route:admin-visibility';
const ADMIN_METADATA_ROUTE_ID = 'route:admin-metadata';
const ADMIN_AUDIT_ROUTE_ID = 'route:admin-audit';

const KNOWN_ROUTE_DEFINITIONS = Object.freeze([
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
    path: '/admin/auth/providers',
    label: 'Auth',
    description: 'Provider di login e credenziali locali.',
    isAdmin: true,
    sortOrder: 5,
  },
  {
    id: ADMIN_ENTITY_CONFIG_ROUTE_ID,
    path: '/admin/entity-config',
    label: 'Entity Config',
    description: 'Catalogo e sezioni di configurazione entity.',
    isAdmin: true,
    sortOrder: 10,
  },
  {
    id: ADMIN_APPS_ROUTE_ID,
    path: '/admin/apps',
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
    path: '/admin/query-templates',
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
    path: '/admin/metadata',
    label: 'Metadata',
    description: 'Export, preview e deploy package zip versionabili.',
    isAdmin: true,
    sortOrder: 55,
  },
  {
    id: ADMIN_AUDIT_ROUTE_ID,
    path: '/admin/audit?tab=security',
    label: 'Audit',
    description: 'Stream read-only e dettaglio eventi.',
    isAdmin: true,
    sortOrder: 60,
  },
]);

const KNOWN_ROUTE_DEFINITION_BY_ID = Object.freeze(
  Object.fromEntries(KNOWN_ROUTE_DEFINITIONS.map((definition) => [definition.id, definition])),
);

function isKnownRouteId(value) {
  return typeof value === 'string' && Object.hasOwn(KNOWN_ROUTE_DEFINITION_BY_ID, value);
}

function isAdminRouteId(value) {
  return isKnownRouteId(value) && KNOWN_ROUTE_DEFINITION_BY_ID[value].isAdmin;
}

module.exports = {
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
};
