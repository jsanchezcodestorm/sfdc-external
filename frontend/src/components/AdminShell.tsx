import { useEffect, useMemo } from 'react'
import { Outlet, matchPath, useLocation } from 'react-router-dom'

import {
  buildAuthAdminLocalCredentialsPath,
  buildAuthAdminProviderCreatePath,
  buildAuthAdminProvidersPath,
} from '../features/auth-admin/auth-admin-utils'
import {
  AUDIT_TAB_COPY,
  buildAuditListPath,
  buildAuditSearch,
  parseAuditTab,
} from '../features/audit-admin/audit-admin-utils'
import {
  buildAppsAdminCreatePath,
  buildAppsAdminEditPath,
  buildAppsAdminHomeBuilderPath,
  buildAppsAdminListPath,
  buildAppsAdminViewPath,
} from '../features/apps-admin/apps-admin-utils'
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
  buildMetadataAdminPath,
  buildMetadataAdminPreviewPath,
} from '../features/metadata-admin/metadata-admin-utils'
import { buildQueryTemplateListPath } from '../features/query-template-admin/query-template-admin-utils'
import {
  ADMIN_ACL_ROUTE_ID,
  ADMIN_APPS_ROUTE_ID,
  ADMIN_AUDIT_ROUTE_ID,
  ADMIN_AUTH_ROUTE_ID,
  ADMIN_ENTITY_CONFIG_ROUTE_ID,
  ADMIN_METADATA_ROUTE_ID,
  ADMIN_QUERY_TEMPLATES_ROUTE_ID,
  ADMIN_VISIBILITY_ROUTE_ID,
} from '../features/route-access/route-access-registry'
import type { AdminRouteId } from '../features/route-access/route-access-types'
import { useRouteAccess } from '../features/route-access/useRouteAccess'

import {
  AdminSidebar,
  type AdminSidebarItem,
  type AdminSidebarModule,
  type AdminSidebarSection,
} from './AdminSidebar'
import { useAdminNavigation } from './useAdminNavigation'

type AdminSidebarSectionKey = 'access' | 'model-apps' | 'security' | 'operations'

type AdminSidebarModuleDefinition = AdminSidebarModule & {
  sectionId: AdminSidebarSectionKey
}

const ADMIN_SIDEBAR_SECTIONS: ReadonlyArray<{
  id: AdminSidebarSectionKey
  label: string
}> = [
  { id: 'access', label: 'Accesso' },
  { id: 'model-apps', label: 'Modello & App' },
  { id: 'security', label: 'Sicurezza' },
  { id: 'operations', label: 'Operazioni' },
] as const

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

  const sections = useMemo(
    () => buildAdminSidebarSections(location.pathname, location.search, allowedAdminRouteIds),
    [allowedAdminRouteIds, location.pathname, location.search],
  )

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#f1f5f9_100%)] text-slate-900">
      <div
        className={`fixed inset-x-0 bottom-0 top-[57px] z-40 lg:hidden ${
          isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div
          aria-hidden={!isSidebarOpen}
          className={`absolute inset-0 bg-slate-950/45 transition ${
            isSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={closeSidebar}
        />

        <div
          className={`absolute left-0 top-0 h-full w-[min(19rem,calc(100vw-1.5rem))] transform transition ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <AdminSidebar
            eyebrow="Admin"
            title="Backoffice"
            description="Navigazione operativa per configurazione, sicurezza e strumenti di controllo."
            sections={sections}
            onNavigate={closeSidebar}
          />
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="fixed left-0 top-[57px] h-[calc(100vh-57px)] w-72">
          <AdminSidebar
            eyebrow="Admin"
            title="Backoffice"
            description="Navigazione operativa per configurazione, sicurezza e strumenti di controllo."
            sections={sections}
          />
        </div>
      </div>

      <main className="min-h-screen px-4 py-5 sm:px-6 lg:pl-[19rem] lg:pr-8">
        <Outlet />
      </main>
    </div>
  )
}

function buildAdminSidebarSections(
  pathname: string,
  search: string,
  allowedAdminRouteIds: readonly AdminRouteId[],
): AdminSidebarSection[] {
  const allowedRouteIdSet = new Set(allowedAdminRouteIds)
  const modules = [
    buildAuthModule(pathname, allowedRouteIdSet),
    buildEntityConfigModule(pathname, allowedRouteIdSet),
    buildAppsModule(pathname, allowedRouteIdSet),
    buildAclModule(pathname, allowedRouteIdSet),
    buildQueryTemplatesModule(pathname, allowedRouteIdSet),
    buildVisibilityModule(pathname, allowedRouteIdSet),
    buildMetadataModule(pathname, allowedRouteIdSet),
    buildAuditModule(pathname, search, allowedRouteIdSet),
  ].filter((module): module is AdminSidebarModuleDefinition => module !== null)

  return ADMIN_SIDEBAR_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    modules: modules
      .filter((module) => module.sectionId === section.id)
      .map(stripSectionId),
  })).filter((section) => section.modules.length > 0)
}

function stripSectionId(module: AdminSidebarModuleDefinition): AdminSidebarModule {
  return {
    id: module.id,
    label: module.label,
    to: module.to,
    description: module.description,
    isActive: module.isActive,
    items: module.items,
  }
}

function buildAuthModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): AdminSidebarModuleDefinition | null {
  if (!allowedRouteIdSet.has(ADMIN_AUTH_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/auth')
  const isProvidersRoute =
    pathname === buildAuthAdminProvidersPath() ||
    pathname === buildAuthAdminProviderCreatePath() ||
    matchPath('/admin/auth/providers/:providerId/edit', pathname) !== null
  const isLocalCredentialsRoute = pathname === buildAuthAdminLocalCredentialsPath()
  const providersCaption = matchPath('/admin/auth/providers/:providerId/edit', pathname)
    ? 'Editor configurazione'
    : pathname === buildAuthAdminProviderCreatePath()
      ? 'Nuovo provider'
      : 'Registry runtime e override admin'

  return {
    sectionId: 'access',
    id: 'auth',
    label: 'Auth',
    to: buildAuthAdminProvidersPath(),
    description: 'Provider OIDC e credenziali locali.',
    isActive,
    items: [
      {
        id: 'auth-providers',
        label: 'Providers',
        to: buildAuthAdminProvidersPath(),
        caption: providersCaption,
        isActive: isProvidersRoute,
      },
      {
        id: 'auth-local-credentials',
        label: 'Local Credentials',
        to: buildAuthAdminLocalCredentialsPath(),
        caption: 'Provisioning credenziali Contact',
        isActive: isLocalCredentialsRoute,
      },
    ],
  }
}

function buildEntityConfigModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): AdminSidebarModuleDefinition | null {
  if (!allowedRouteIdSet.has(ADMIN_ENTITY_CONFIG_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/entity-config')
  const isCatalogRoute = pathname === buildEntityCatalogPath()
  const isCreateRoute = pathname === buildEntityCreatePath()
  const editMatch = parseEntityConfigEditPath(pathname)
  const viewMatch = isCreateRoute ? null : matchPath('/admin/entity-config/:entityId', pathname)
  const activeSection = editMatch?.section ?? null
  const activeLayoutId = editMatch?.layoutId ?? null
  const entityId = editMatch?.entityId
    ? editMatch.entityId
    : viewMatch?.params.entityId
      ? decodeURIComponent(viewMatch.params.entityId)
      : null

  const items: AdminSidebarItem[] = [
    {
      id: 'entity-catalog',
      label: 'Catalogo',
      to: buildEntityCatalogPath(),
      caption: 'Lista entity',
      isActive: isCatalogRoute,
    },
  ]

  if (isCreateRoute) {
    items.push(
      {
        id: 'entity-object',
        label: 'Object',
        to: buildEntityCreatePath(),
        caption: 'Collega l’oggetto Salesforce',
        isActive: true,
      },
      {
        id: 'entity-next-steps',
        label: 'Workspace',
        caption: 'Disponibile dopo il primo salvataggio',
        isDisabled: true,
      },
    )
  } else if (entityId) {
    items.push({
      id: 'entity-overview',
      label: 'Overview',
      to: buildEntityViewPath(entityId),
      caption: 'Vista in sola lettura',
      isActive: Boolean(viewMatch),
    })

    for (const section of ENTITY_CONFIG_SECTION_ORDER) {
      items.push({
        id: `entity-${section}`,
        label: ENTITY_CONFIG_SECTION_LABELS[section],
        to: buildEntityEditPath(entityId, section, undefined, activeLayoutId),
        caption: section === 'layouts' ? 'List, assignments, detail e form' : 'Editor sezione',
        isActive:
          section === 'layouts'
            ? activeSection === 'layouts' ||
              activeSection === 'detail' ||
              activeSection === 'form' ||
              activeSection === 'assignments'
            : activeSection === section,
      })
    }
  }

  return {
    sectionId: 'model-apps',
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
): AdminSidebarModuleDefinition | null {
  if (!allowedRouteIdSet.has(ADMIN_APPS_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/apps')
  const isCatalogRoute = pathname === buildAppsAdminListPath()
  const isCreateRoute = pathname === buildAppsAdminCreatePath()
  const editMatch = matchPath('/admin/apps/:appId/edit', pathname)
  const homeBuilderMatch = matchPath('/admin/apps/:appId/home-builder', pathname)
  const viewMatch = isCreateRoute ? null : matchPath('/admin/apps/:appId', pathname)
  const appId = homeBuilderMatch?.params.appId
    ? decodeURIComponent(homeBuilderMatch.params.appId)
    : editMatch?.params.appId
    ? decodeURIComponent(editMatch.params.appId)
    : viewMatch?.params.appId
      ? decodeURIComponent(viewMatch.params.appId)
      : null

  const items: AdminSidebarItem[] = [
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
      caption: 'Flusso di creazione',
      isActive: true,
    })
  } else if (appId) {
    items.push(
      {
        id: 'apps-overview',
        label: 'Overview',
        to: buildAppsAdminViewPath(appId),
        caption: 'Dettaglio in sola lettura',
        isActive: Boolean(viewMatch),
      },
      {
        id: 'apps-edit',
        label: 'Edit',
        to: buildAppsAdminEditPath(appId),
        caption: 'Editor metadata',
        isActive: Boolean(editMatch),
      },
      {
        id: 'apps-home-builder',
        label: 'Home Builder',
        to: buildAppsAdminHomeBuilderPath(appId),
        caption: 'Canvas visuale home',
        isActive: Boolean(homeBuilderMatch),
      },
    )
  }

  return {
    sectionId: 'model-apps',
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
): AdminSidebarModuleDefinition | null {
  if (!allowedRouteIdSet.has(ADMIN_ACL_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/acl')

  return {
    sectionId: 'security',
    id: 'acl',
    label: 'ACL',
    to: '/admin/acl/permissions',
    description: 'Permessi, default, assegnazioni Contact e risorse ACL.',
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
        caption: 'Default permissions globali',
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
        caption: 'Risorse ACL',
        isActive: pathname.startsWith('/admin/acl/resources'),
      },
    ],
  }
}

function buildQueryTemplatesModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): AdminSidebarModuleDefinition | null {
  if (!allowedRouteIdSet.has(ADMIN_QUERY_TEMPLATES_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/query-templates')

  return {
    sectionId: 'model-apps',
    id: 'query-templates',
    label: 'Query Templates',
    to: buildQueryTemplateListPath(),
    description: 'Catalogo template query.',
    isActive,
    items: [],
  }
}

function buildVisibilityModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): AdminSidebarModuleDefinition | null {
  if (!allowedRouteIdSet.has(ADMIN_VISIBILITY_ROUTE_ID)) {
    return null
  }

  const isActive = pathname.startsWith('/admin/visibility')

  return {
    sectionId: 'security',
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

function buildMetadataModule(
  pathname: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): AdminSidebarModuleDefinition | null {
  if (!allowedRouteIdSet.has(ADMIN_METADATA_ROUTE_ID)) {
    return null
  }

  const isPackagesRoute = pathname === buildMetadataAdminPath()
  const isPreviewRoute = pathname === buildMetadataAdminPreviewPath()
  const isActive = pathname.startsWith(buildMetadataAdminPath())

  return {
    sectionId: 'operations',
    id: 'metadata',
    label: 'Metadata',
    to: buildMetadataAdminPath(),
    description: 'Package zip YAML per retrieve, preview e deploy.',
    isActive,
    items: [
      {
        id: 'metadata-packages',
        label: 'Packages',
        to: buildMetadataAdminPath(),
        caption: 'Export zip e selezione package',
        isActive: isPackagesRoute,
      },
      {
        id: 'metadata-preview',
        label: 'Preview',
        to: buildMetadataAdminPreviewPath(),
        caption: 'Diff package, blocker e deploy',
        isActive: isPreviewRoute,
      },
    ],
  }
}

function buildAuditModule(
  pathname: string,
  search: string,
  allowedRouteIdSet: ReadonlySet<AdminRouteId>,
): AdminSidebarModuleDefinition | null {
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
    sectionId: 'operations',
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
