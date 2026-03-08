import { normalizeEntityBasePath } from '../entities/entity-helpers'
import type { AvailableApp, AvailableAppEntity } from './app-types'

export function getAppEntityBasePath(entity: AvailableAppEntity): string {
  return normalizeEntityBasePath(entity.id, entity.basePath)
}

export function isSalesforceRecordId(value: string | null | undefined): boolean {
  const normalizedValue = value?.trim() ?? ''
  return /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(normalizedValue)
}

export function extractRuntimeEntityId(pathname: string): string | null {
  const match = /^\/s\/([^/]+)/.exec(pathname)
  if (!match) {
    return null
  }

  const entityId = decodeURIComponent(match[1] ?? '').trim()
  if (entityId.length === 0 || isSalesforceRecordId(entityId)) {
    return null
  }

  return entityId
}

export function findEntityInScope(
  entities: AvailableAppEntity[] | null | undefined,
  entityId: string | null | undefined,
): AvailableAppEntity | null {
  if (!entities || !entityId) {
    return null
  }

  return entities.find((entity) => entity.id === entityId) ?? null
}

export function findEntitiesInScopeByObjectApiName(
  entities: AvailableAppEntity[] | null | undefined,
  objectApiName: string | null | undefined,
): AvailableAppEntity[] {
  const normalizedObjectApiName = objectApiName?.trim().toLowerCase() ?? ''
  if (!entities || !normalizedObjectApiName) {
    return []
  }

  return entities.filter((entity) => entity.objectApiName.trim().toLowerCase() === normalizedObjectApiName)
}

export function findEntitiesInScopeByRecordId(
  entities: AvailableAppEntity[] | null | undefined,
  recordId: string | null | undefined,
): AvailableAppEntity[] {
  const normalizedRecordId = recordId?.trim() ?? ''
  if (!entities || !isSalesforceRecordId(normalizedRecordId)) {
    return []
  }

  const keyPrefix = normalizedRecordId.slice(0, 3).toLowerCase()
  return entities.filter((entity) => (entity.keyPrefix?.trim().toLowerCase() ?? '') === keyPrefix)
}

export function resolveScopedEntityBasePath(
  entityId: string,
  entities: AvailableAppEntity[] | null | undefined,
): string {
  const scopedEntity = findEntityInScope(entities, entityId)
  return scopedEntity ? getAppEntityBasePath(scopedEntity) : normalizeEntityBasePath(entityId)
}

export function findEntityInApp(
  app: AvailableApp | null | undefined,
  entityId: string | null | undefined,
): AvailableAppEntity | null {
  return findEntityInScope(app?.entities, entityId)
}

export function isEntityInApp(
  app: AvailableApp | null | undefined,
  entityId: string | null | undefined,
): boolean {
  return findEntityInApp(app, entityId) !== null
}

export function getFirstAppEntityPath(app: AvailableApp | null | undefined): string | null {
  const firstEntity = app?.entities[0]
  return firstEntity ? getAppEntityBasePath(firstEntity) : null
}

export function getActiveRuntimeTabEntityId(
  pathname: string,
  selectedApp: AvailableApp | null | undefined,
): string | null {
  const runtimeEntityId = extractRuntimeEntityId(pathname)
  if (!runtimeEntityId || !isEntityInApp(selectedApp, runtimeEntityId)) {
    return null
  }

  return runtimeEntityId
}

export function isRuntimeEntityOutsideSelectedApp(
  pathname: string,
  selectedApp: AvailableApp | null | undefined,
): boolean {
  const runtimeEntityId = extractRuntimeEntityId(pathname)
  if (!runtimeEntityId) {
    return false
  }

  return !isEntityInApp(selectedApp, runtimeEntityId)
}

export function resolveAppSelectionNavigationTarget(options: {
  pathname: string
  search: string
  hash: string
  nextApp: AvailableApp | null
}): string {
  const { pathname, search, hash, nextApp } = options

  if (pathname === '/') {
    return '/'
  }

  const runtimeEntityId = extractRuntimeEntityId(pathname)
  if (runtimeEntityId && isEntityInApp(nextApp, runtimeEntityId)) {
    return `${pathname}${search}${hash}`
  }

  return getFirstAppEntityPath(nextApp) ?? '/'
}
