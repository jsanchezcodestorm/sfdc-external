import { normalizeEntityBasePath } from '../entities/entity-helpers'
import type { AvailableApp, AvailableAppEntity } from './app-types'

export function getAppEntityBasePath(entity: AvailableAppEntity): string {
  return normalizeEntityBasePath(entity.id, entity.basePath)
}

export function extractRuntimeEntityId(pathname: string): string | null {
  const match = /^\/s\/([^/]+)/.exec(pathname)
  if (!match) {
    return null
  }

  const entityId = decodeURIComponent(match[1] ?? '').trim()
  return entityId.length > 0 ? entityId : null
}

export function findEntityInApp(
  app: AvailableApp | null | undefined,
  entityId: string | null | undefined,
): AvailableAppEntity | null {
  if (!app || !entityId) {
    return null
  }

  return app.entities.find((entity) => entity.id === entityId) ?? null
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
