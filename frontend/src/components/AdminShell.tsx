import { useEffect, useMemo } from 'react'
import { Outlet, matchPath, useLocation } from 'react-router-dom'

import {
  buildAppsAdminCreatePath,
  buildAppsAdminListPath,
  buildAppsAdminEditPath,
  buildAppsAdminViewPath,
} from '../features/apps-admin/apps-admin-utils'
import { AUDIT_TAB_COPY, buildAuditListPath, buildAuditSearch, parseAuditTab } from '../features/audit-admin/audit-admin-utils'
import {
  buildEntityCatalogPath,
  buildEntityCreatePath,
  buildEntityEditPath,
  buildEntityViewPath,
  ENTITY_CONFIG_SECTION_LABELS,
  ENTITY_CONFIG_SECTION_ORDER,
  parseEntityConfigEditPath,
} from '../features/entities-admin/entity-admin-routing'
import {
  WorkspaceSidebar,
  type WorkspaceSidebarItem,
  type WorkspaceSidebarModule,
} from './WorkspaceSidebar'
import { useAdminNavigation } from './useAdminNavigation'
import {
  ADMIN_ACL_ROUTE_ID,
  ADMIN_APPS_ROUTE_ID,
  ADMIN_AUDIT_ROUTE_ID,
  ADMIN_ENTITY_CONFIG_ROUTE_ID,
  ADMIN_QUERY_TEMPLATES_ROUTE_ID,
  ADMIN_VISIBILITY_ROUTE_ID,
} from '../features/route-access/route-access-registry'
import type { AdminRouteId } from '../features/route-access/route-access-types'
import { useRouteAccess } from '../features/route-access/useRouteAccess'

export function AdminShell() {
  const location = useLocation()
  const { isSidebarOpen, closeSidebar } = useAdminNavigation()
  const { allowedAdminRouteIds } = useRouteAccess()

  useEffect(() => {
    if (!isSidebarOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeSidebar, isSidebarOpen])

  const modules = useMemo(
    () => buildAdminSidebarModules(location.pathname, location.search, allowedAdminRouteIds),
    [allowedAdminRouteIds, location.pathname, location.search],
  )

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <div
        className={`fixed inset-x-0 bottom-0 top-[57px] z-40 lg:hidden ${
          isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div
          aria-hidden={!isSidebarOpen}
          className={`absolute inset-0 bg-slate-950/35 transition ${
            isSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={closeSidebar}
        />

        <div
          className={`absolute left-0 top-0 h-full w-[min(20rem,calc(100vw-1.5rem))] transform transition ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <WorkspaceSidebar
            eyebrow="Admin"
            title="Backoffice"
            modules={modules}
            onNavigate={closeSidebar}
          />
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="fixed left-0 top-[57px] h-[calc(100vh-57px)] w-80">
          <WorkspaceSidebar
            eyebrow="Admin"
            title="Backoffice"
            modules={modules}
          />
        </div>
      </div>

      <main className="min-h-screen px-4 py-6 sm:px-6 lg:pl-[21rem]">
        <Outlet />
      </main>
    </div>
  )
}

function buildAdminSidebarModules(
  pathname: string,
  search: string,
  allowedAdminRouteIds: readonly AdminRouteId[],
): WorkspaceSidebarModule[] {
  const allowedRouteIdSet = new Set(allowedAdminRouteIds)

  return [
    buildEntityConfigModule(pathname, allowedRouteIdSet),
    buildAppsModule(pathname, allowedRouteIdSet),
    buildAclModule(pathname, allowedRouteIdSet),
    buildQueryTemplatesModule(pathname, allowedRouteIdSet),
    buildVisibilityModule(pathname, allowedRouteIdSet),
    buildAuditModule(pathname, search, allowedRouteIdSet),
  ].filter((module): module is WorkspaceSidebarModule => module !== null)
}

function buildEntityConfigModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): WorkspaceSidebarModule | null {
  if (!allowedRouteIdSet.has(ADMIN_ENTITY_CONFIG_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/entity-config')
  const isCatalogRoute = pathname === buildEntityCatalogPath()
  const isCreateRoute = pathname === buildEntityCreatePath()
  const editMatch = parseEntityConfigEditPath(pathname)
  const viewMatch = isCreateRoute ? null : matchPath('/admin/entity-config/:entityId', pathname)
  const activeSection = editMatch?.section ?? null
  const entityId = editMatch?.entityId
    ? editMatch.entityId
    : viewMatch?.params.entityId
    ? decodeURIComponent(viewMatch.params.entityId)
    : null
  const items: WorkspaceSidebarItem[] = [
    {
      id: 'entity-catalog',
      label: 'Catalogo',
      to: buildEntityCatalogPath(),
      caption: 'Lista entita',
      isActive: isCatalogRoute,
    },
  ]

  if (isCreateRoute) {
    items.push(
      {
        id: 'entity-base',
        label: 'Base',
        to: buildEntityCreatePath(),
        caption: 'Prima configurazione',
        isActive: true,
      },
      {
        id: 'entity-list',
        label: 'List',
        caption: 'Disponibile dopo il primo save',
        isDisabled: true,
      },
      {
        id: 'entity-detail',
        label: 'Detail',
        caption: 'Disponibile dopo il primo save',
        isDisabled: true,
      },
      {
        id: 'entity-form',
        label: 'Form',
        caption: 'Disponibile dopo il primo save',
        isDisabled: true,
      },
    )
  } else if (entityId) {
    items.push({
      id: 'entity-overview',
      label: 'Overview',
      to: buildEntityViewPath(entityId),
      caption: 'Vista readonly',
      isActive: Boolean(viewMatch),
    })

    for (const section of ENTITY_CONFIG_SECTION_ORDER) {
      items.push({
        id: `entity-${section}`,
        label: ENTITY_CONFIG_SECTION_LABELS[section],
        to: buildEntityEditPath(entityId, section),
        caption: 'Editor sezione',
        isActive: activeSection === section,
      })
    }
  }

  return {
    id: 'entity-config',
    label: 'Entity Config',
    to: buildEntityCatalogPath(),
    description: 'Catalogo e sezioni della entity selezionata.',
    isActive,
    items,
  }
}

function buildAppsModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): WorkspaceSidebarModule | null {
  if (!allowedRouteIdSet.has(ADMIN_APPS_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/apps')
  const isCatalogRoute = pathname === buildAppsAdminListPath()
  const isCreateRoute = pathname === buildAppsAdminCreatePath()
  const editMatch = matchPath('/admin/apps/:appId/edit', pathname)
  const viewMatch = isCreateRoute ? null : matchPath('/admin/apps/:appId', pathname)
  const appId = editMatch?.params.appId
    ? decodeURIComponent(editMatch.params.appId)
    : viewMatch?.params.appId
    ? decodeURIComponent(viewMatch.params.appId)
    : null

  const items: WorkspaceSidebarItem[] = [
    {
      id: 'apps-catalog',
      label: 'Catalogo',
      to: buildAppsAdminListPath(),
      caption: 'Lista app configurate',
      isActive: isCatalogRoute,
    },
  ]

  if (isCreateRoute) {
    items.push({
      id: 'apps-create',
      label: 'Nuova app',
      to: buildAppsAdminCreatePath(),
      caption: 'Create flow',
      isActive: true,
    })
  } else if (appId) {
    items.push(
      {
        id: 'apps-overview',
        label: 'Overview',
        to: buildAppsAdminViewPath(appId),
        caption: 'Dettaglio readonly',
        isActive: Boolean(viewMatch),
      },
      {
        id: 'apps-edit',
        label: 'Edit',
        to: buildAppsAdminEditPath(appId),
        caption: 'Editor metadata',
        isActive: Boolean(editMatch),
      },
    )
  }

  return {
    id: 'apps',
    label: 'Apps',
    to: buildAppsAdminListPath(),
    description: 'Catalogo UI con associazioni Entity e Permission.',
    isActive,
    items,
  }
}

function buildAclModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): WorkspaceSidebarModule | null {
  if (!allowedRouteIdSet.has(ADMIN_ACL_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/acl')

  return {
    id: 'acl',
    label: 'ACL',
    to: '/admin/acl/permissions',
    description: 'Permessi, defaults, assegnazioni Contact e risorse ACL.',
    isActive,
    items: [
      {
        id: 'acl-permissions',
        label: 'Permissions',
        to: '/admin/acl/permissions',
        caption: 'Catalogo e dettaglio permessi',
        isActive: pathname.startsWith('/admin/acl/permissions'),
      },
      {
        id: 'acl-defaults',
        label: 'Defaults',
        to: '/admin/acl/defaults',
        caption: 'Default permissions',
        isActive: pathname.startsWith('/admin/acl/defaults'),
      },
      {
        id: 'acl-contact-permissions',
        label: 'Contact Permissions',
        to: '/admin/acl/contact-permissions',
        caption: 'Assegnazioni esplicite per Contact',
        isActive: pathname.startsWith('/admin/acl/contact-permissions'),
      },
      {
        id: 'acl-resources',
        label: 'Resources',
        to: '/admin/acl/resources',
        caption: 'ACL resources',
        isActive: pathname.startsWith('/admin/acl/resources'),
      },
    ],
  }
}

function buildQueryTemplatesModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): WorkspaceSidebarModule | null {
  if (!allowedRouteIdSet.has(ADMIN_QUERY_TEMPLATES_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/query-templates')

  return {
    id: 'query-templates',
    label: 'Query Templates',
    to: '/admin/query-templates',
    description: 'Catalogo template query.',
    isActive,
    items: [
      {
        id: 'query-templates-catalog',
        label: 'Catalogo',
        to: '/admin/query-templates',
        caption: 'Lista, view ed edit',
        isActive,
      },
    ],
  }
}

function buildVisibilityModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): WorkspaceSidebarModule | null {
  if (!allowedRouteIdSet.has(ADMIN_VISIBILITY_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/visibility')

  return {
    id: 'visibility',
    label: 'Visibility',
    to: '/admin/visibility/cones',
    description: 'Cones, rules, assignments e debug.',
    isActive,
    items: [
      {
        id: 'visibility-cones',
        label: 'Cones',
        to: '/admin/visibility/cones',
        caption: 'Catalogo e editor cones',
        isActive: pathname.startsWith('/admin/visibility/cones'),
      },
      {
        id: 'visibility-rules',
        label: 'Rules',
        to: '/admin/visibility/rules',
        caption: 'Catalogo globale e ricerca',
        isActive: pathname.startsWith('/admin/visibility/rules'),
      },
      {
        id: 'visibility-assignments',
        label: 'Assignments',
        to: '/admin/visibility/assignments',
        caption: 'Catalogo globale e ricerca',
        isActive: pathname.startsWith('/admin/visibility/assignments'),
      },
      {
        id: 'visibility-debug',
        label: 'Debug',
        to: '/admin/visibility/debug',
        caption: 'Strumenti di verifica',
        isActive: pathname.startsWith('/admin/visibility/debug'),
      },
    ],
  }
}

function buildAuditModule(
  pathname: string,
  search: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): WorkspaceSidebarModule | null {
  if (!allowedRouteIdSet.has(ADMIN_AUDIT_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/audit')
  const detailMatch = matchPath('/admin/audit/:stream/:auditId', pathname)
  const detailStream = detailMatch?.params.stream
  const activeStream =
    detailStream &&
    (detailStream === 'security' ||
      detailStream === 'visibility' ||
      detailStream === 'application' ||
      detailStream === 'query')
      ? detailStream
      : parseAuditTab(new URLSearchParams(search).get('tab'))

  return {
    id: 'audit',
    label: 'Audit',
    to: `${buildAuditListPath()}${buildAuditSearch('security')}`,
    description: 'Stream read-only e dettaglio evento.',
    isActive,
    items: [
      {
        id: 'audit-security',
        label: AUDIT_TAB_COPY.security.title,
        to: `${buildAuditListPath()}${buildAuditSearch('security')}`,
        caption: AUDIT_TAB_COPY.security.description,
        isActive: activeStream === 'security',
      },
      {
        id: 'audit-visibility',
        label: AUDIT_TAB_COPY.visibility.title,
        to: `${buildAuditListPath()}${buildAuditSearch('visibility')}`,
        caption: AUDIT_TAB_COPY.visibility.description,
        isActive: activeStream === 'visibility',
      },
      {
        id: 'audit-application',
        label: AUDIT_TAB_COPY.application.title,
        to: `${buildAuditListPath()}${buildAuditSearch('application')}`,
        caption: AUDIT_TAB_COPY.application.description,
        isActive: activeStream === 'application',
      },
      {
        id: 'audit-query',
        label: AUDIT_TAB_COPY.query.title,
        to: `${buildAuditListPath()}${buildAuditSearch('query')}`,
        caption: AUDIT_TAB_COPY.query.description,
        isActive: activeStream === 'query',
      },
    ],
  }
}
