import type {
  AvailableApp,
  AvailableAppEntityItem,
  AvailableAppHomeItem,
  AvailableAppItem,
} from './app-types'

export function buildAppHomePath(appId: string): string {
  return `/app/${encodeURIComponent(appId)}`
}

export function buildAppEntityBasePath(appId: string, entityId: string): string {
  return `${buildAppHomePath(appId)}/entity/${encodeURIComponent(entityId)}`
}

export function buildAppItemPath(appId: string, itemId: string): string {
  return `${buildAppHomePath(appId)}/items/${encodeURIComponent(itemId)}`
}

export function isAppRuntimePath(pathname: string): boolean {
  return pathname.startsWith('/app/')
}

export function extractAppIdFromPathname(pathname: string): string | null {
  const match = /^\/app\/([^/]+)/.exec(pathname)
  if (!match) {
    return null
  }

  const appId = decodeURIComponent(match[1] ?? '').trim()
  return appId.length > 0 ? appId : null
}

export function extractRuntimeEntityId(pathname: string): string | null {
  const match = /^\/app\/[^/]+\/entity\/([^/]+)/.exec(pathname)
  if (!match) {
    return null
  }

  const entityId = decodeURIComponent(match[1] ?? '').trim()
  return entityId.length > 0 ? entityId : null
}

export function extractRuntimeItemId(pathname: string): string | null {
  const match = /^\/app\/[^/]+\/items\/([^/]+)/.exec(pathname)
  if (!match) {
    return null
  }

  const itemId = decodeURIComponent(match[1] ?? '').trim()
  return itemId.length > 0 ? itemId : null
}

export function isSalesforceRecordId(value: string | null | undefined): boolean {
  const normalizedValue = value?.trim() ?? ''
  return /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(normalizedValue)
}

export function getEntityItems(app: AvailableApp | null | undefined): AvailableAppEntityItem[] {
  return (app?.items ?? []).filter((item): item is AvailableAppEntityItem => item.kind === 'entity')
}

export function getHomeItem(app: AvailableApp | null | undefined): AvailableAppHomeItem | null {
  return (app?.items ?? []).find((item): item is AvailableAppHomeItem => item.kind === 'home') ?? null
}

export function findItemInApp(
  app: AvailableApp | null | undefined,
  itemId: string | null | undefined,
): AvailableAppItem | null {
  if (!app || !itemId) {
    return null
  }

  return app.items.find((item) => item.id === itemId) ?? null
}

export function findEntityInScope(
  entities: AvailableAppEntityItem[] | null | undefined,
  entityId: string | null | undefined,
): AvailableAppEntityItem | null {
  if (!entities || !entityId) {
    return null
  }

  return entities.find((entity) => entity.entityId === entityId) ?? null
}

export function findEntitiesInScopeByObjectApiName(
  entities: AvailableAppEntityItem[] | null | undefined,
  objectApiName: string | null | undefined,
): AvailableAppEntityItem[] {
  const normalizedObjectApiName = objectApiName?.trim().toLowerCase() ?? ''
  if (!entities || !normalizedObjectApiName) {
    return []
  }

  return entities.filter((entity) => entity.objectApiName.trim().toLowerCase() === normalizedObjectApiName)
}

export function findEntitiesInScopeByRecordId(
  entities: AvailableAppEntityItem[] | null | undefined,
  recordId: string | null | undefined,
): AvailableAppEntityItem[] {
  const normalizedRecordId = recordId?.trim() ?? ''
  if (!entities || !isSalesforceRecordId(normalizedRecordId)) {
    return []
  }

  const keyPrefix = normalizedRecordId.slice(0, 3).toLowerCase()
  return entities.filter((entity) => (entity.keyPrefix?.trim().toLowerCase() ?? '') === keyPrefix)
}

export function resolveScopedEntityBasePath(
  appId: string,
  entityId: string,
  entities: AvailableAppEntityItem[] | null | undefined,
): string {
  const scopedEntity = findEntityInScope(entities, entityId)
  return buildAppEntityBasePath(appId, scopedEntity?.entityId ?? entityId)
}

export function getAppItemInternalPath(
  appId: string,
  item: AvailableAppItem | null | undefined,
): string | null {
  if (!item) {
    return null
  }

  switch (item.kind) {
    case 'home':
      return buildAppHomePath(appId)
    case 'entity':
      return buildAppEntityBasePath(appId, item.entityId)
    case 'custom-page':
      return buildAppItemPath(appId, item.id)
    case 'external-link':
      return item.openMode === 'iframe' ? buildAppItemPath(appId, item.id) : null
    case 'report':
      return item.openMode === 'iframe' ? buildAppItemPath(appId, item.id) : null
  }
}

export function getAppItemHref(
  appId: string,
  item: AvailableAppItem | null | undefined,
): string | null {
  if (!item) {
    return null
  }

  const internalPath = getAppItemInternalPath(appId, item)
  if (internalPath) {
    return internalPath
  }

  if (item.kind === 'external-link' || item.kind === 'report') {
    return item.url
  }

  return null
}

export function getDefaultAppPath(app: AvailableApp | null | undefined): string | null {
  return app ? buildAppHomePath(app.id) : null
}

export function getFirstAppEntityPath(app: AvailableApp | null | undefined): string | null {
  const firstEntity = getEntityItems(app)[0]
  return firstEntity && app ? buildAppEntityBasePath(app.id, firstEntity.entityId) : null
}

export function getActiveRuntimeTabKey(
  pathname: string,
  selectedApp: AvailableApp | null | undefined,
): string | null {
  if (!selectedApp) {
    return null
  }

  if (pathname === buildAppHomePath(selectedApp.id)) {
    return 'home'
  }

  const itemId = extractRuntimeItemId(pathname)
  if (itemId && findItemInApp(selectedApp, itemId)) {
    return itemId
  }

  const entityId = extractRuntimeEntityId(pathname)
  if (!entityId) {
    return null
  }

  const entityItem = findEntityInScope(getEntityItems(selectedApp), entityId)
  return entityItem?.id ?? null
}

export function resolveAppSelectionNavigationTarget(
  nextApp: AvailableApp | null,
): string {
  return getDefaultAppPath(nextApp) ?? '/'
}
