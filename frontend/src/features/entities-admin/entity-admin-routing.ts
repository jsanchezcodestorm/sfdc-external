import type { EntityConfigSectionKey } from './entity-admin-types'

export const NEW_ENTITY_SENTINEL = '__new__'

export const ENTITY_CONFIG_SECTION_ORDER: EntityConfigSectionKey[] = [
  'base',
  'list',
  'detail',
  'form',
]

export const ENTITY_CONFIG_SECTION_LABELS: Record<EntityConfigSectionKey, string> = {
  base: 'Base',
  list: 'List',
  detail: 'Detail',
  form: 'Form',
}

export function isEntityConfigSection(value: string | null | undefined): value is EntityConfigSectionKey {
  return value === 'base' || value === 'list' || value === 'detail' || value === 'form'
}

export function buildEntityCatalogPath(): string {
  return '/admin/entity-config'
}

export function buildEntityViewPath(entityId: string): string {
  return `/admin/entity-config/${encodeURIComponent(entityId)}`
}

export function buildEntityEditPath(
  entityId: string,
  section: EntityConfigSectionKey = 'base',
): string {
  return `/admin/entity-config/${encodeURIComponent(entityId)}/edit/${section}`
}

export function buildEntityCreatePath(): string {
  return `/admin/entity-config/${NEW_ENTITY_SENTINEL}/base`
}
