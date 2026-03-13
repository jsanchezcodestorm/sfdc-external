import { matchPath } from 'react-router-dom'

import type { EntityConfigSectionKey } from './entity-admin-types'

export const NEW_ENTITY_SENTINEL = '__new__'
export const DEFAULT_ENTITY_CONFIG_DETAIL_EDITOR_AREA = 'header-query'
export const DEFAULT_ENTITY_CONFIG_FORM_EDITOR_AREA = 'header-query'

export const ENTITY_CONFIG_SECTION_ORDER: EntityConfigSectionKey[] = [
  'base',
  'list',
  'detail',
  'form',
  'assignments',
]

export const ENTITY_CONFIG_SECTION_LABELS: Record<EntityConfigSectionKey, string> = {
  base: 'Base',
  list: 'List',
  detail: 'Detail',
  form: 'Form',
  assignments: 'Assignments',
}

export type EntityConfigDetailEditorAreaKey =
  | 'header-query'
  | 'actions-status'
  | 'sections'
  | 'related-lists'

export type EntityConfigFormEditorAreaKey = 'header-query' | 'sections'

export type EntityConfigEditRouteMatch = {
  entityId: string
  section: EntityConfigSectionKey
  layoutId: string | null
  detailArea: EntityConfigDetailEditorAreaKey | null
  formArea: EntityConfigFormEditorAreaKey | null
}

export const ENTITY_CONFIG_DETAIL_EDITOR_AREA_ORDER: EntityConfigDetailEditorAreaKey[] = [
  'header-query',
  'actions-status',
  'sections',
  'related-lists',
]

export const ENTITY_CONFIG_DETAIL_EDITOR_AREA_LABELS: Record<
  EntityConfigDetailEditorAreaKey,
  string
> = {
  'header-query': 'Header & Query',
  'actions-status': 'Actions & Status',
  sections: 'Sections',
  'related-lists': 'Related Lists',
}

export const ENTITY_CONFIG_FORM_EDITOR_AREA_ORDER: EntityConfigFormEditorAreaKey[] = [
  'header-query',
  'sections',
]

export const ENTITY_CONFIG_FORM_EDITOR_AREA_LABELS: Record<
  EntityConfigFormEditorAreaKey,
  string
> = {
  'header-query': 'Header & Query',
  sections: 'Sections',
}

export function isEntityConfigSection(value: string | null | undefined): value is EntityConfigSectionKey {
  return (
    value === 'base' ||
    value === 'list' ||
    value === 'detail' ||
    value === 'form' ||
    value === 'assignments'
  )
}

export function isEntityConfigDetailEditorArea(
  value: string | null | undefined,
): value is EntityConfigDetailEditorAreaKey {
  return (
    value === 'header-query' ||
    value === 'actions-status' ||
    value === 'sections' ||
    value === 'related-lists'
  )
}

export function isEntityConfigFormEditorArea(
  value: string | null | undefined,
): value is EntityConfigFormEditorAreaKey {
  return value === 'header-query' || value === 'sections'
}

export function buildEntityCatalogPath(): string {
  return '/admin/entity-config'
}

export function buildEntityViewPath(entityId: string): string {
  return `/admin/entity-config/${encodeURIComponent(entityId)}`
}

export function buildEntityEditPath(
  entityId: string,
  section: 'base' | 'list',
): string
export function buildEntityEditPath(
  entityId: string,
  section: 'detail',
  editorArea?: EntityConfigDetailEditorAreaKey,
  layoutId?: string | null,
): string
export function buildEntityEditPath(
  entityId: string,
  section: 'form',
  editorArea?: EntityConfigFormEditorAreaKey,
  layoutId?: string | null,
): string
export function buildEntityEditPath(
  entityId: string,
  section: 'assignments',
  editorArea?: undefined,
  layoutId?: string | null,
): string
export function buildEntityEditPath(
  entityId: string,
  section: EntityConfigSectionKey,
  editorArea?: EntityConfigDetailEditorAreaKey | EntityConfigFormEditorAreaKey,
  layoutId?: string | null,
): string
export function buildEntityEditPath(
  entityId: string,
  section: EntityConfigSectionKey = 'base',
  editorArea?: EntityConfigDetailEditorAreaKey | EntityConfigFormEditorAreaKey,
  layoutId?: string | null,
): string {
  const encodedEntityId = encodeURIComponent(entityId)
  const normalizedLayoutId =
    typeof layoutId === 'string' && layoutId.trim().length > 0
      ? encodeURIComponent(layoutId.trim())
      : null

  if (section === 'detail') {
    const detailArea = isEntityConfigDetailEditorArea(editorArea)
      ? editorArea
      : DEFAULT_ENTITY_CONFIG_DETAIL_EDITOR_AREA

    if (normalizedLayoutId) {
      return `/admin/entity-config/${encodedEntityId}/edit/layouts/${normalizedLayoutId}/detail/${detailArea}`
    }

    return `/admin/entity-config/${encodedEntityId}/edit/detail/${detailArea}`
  }

  if (section === 'form') {
    const formArea = isEntityConfigFormEditorArea(editorArea)
      ? editorArea
      : DEFAULT_ENTITY_CONFIG_FORM_EDITOR_AREA

    if (normalizedLayoutId) {
      return `/admin/entity-config/${encodedEntityId}/edit/layouts/${normalizedLayoutId}/form/${formArea}`
    }

    return `/admin/entity-config/${encodedEntityId}/edit/form/${formArea}`
  }

  if (section === 'assignments') {
    if (normalizedLayoutId) {
      return `/admin/entity-config/${encodedEntityId}/edit/layouts/${normalizedLayoutId}/assignments`
    }

    return `/admin/entity-config/${encodedEntityId}/edit/assignments`
  }

  return `/admin/entity-config/${encodedEntityId}/edit/${section}`
}

export function buildEntityCreatePath(): string {
  return `/admin/entity-config/${NEW_ENTITY_SENTINEL}/base`
}

export function parseEntityConfigEditPath(pathname: string): EntityConfigEditRouteMatch | null {
  const canonicalDetailMatch = matchPath(
    '/admin/entity-config/:entityId/edit/layouts/:layoutId/detail/:detailArea',
    pathname,
  )
  if (
    canonicalDetailMatch?.params.entityId &&
    canonicalDetailMatch.params.layoutId &&
    isEntityConfigDetailEditorArea(canonicalDetailMatch.params.detailArea)
  ) {
    return {
      entityId: decodeURIComponent(canonicalDetailMatch.params.entityId),
      section: 'detail',
      layoutId: decodeURIComponent(canonicalDetailMatch.params.layoutId),
      detailArea: canonicalDetailMatch.params.detailArea,
      formArea: null,
    }
  }

  const canonicalFormMatch = matchPath(
    '/admin/entity-config/:entityId/edit/layouts/:layoutId/form/:formArea',
    pathname,
  )
  if (
    canonicalFormMatch?.params.entityId &&
    canonicalFormMatch.params.layoutId &&
    isEntityConfigFormEditorArea(canonicalFormMatch.params.formArea)
  ) {
    return {
      entityId: decodeURIComponent(canonicalFormMatch.params.entityId),
      section: 'form',
      layoutId: decodeURIComponent(canonicalFormMatch.params.layoutId),
      detailArea: null,
      formArea: canonicalFormMatch.params.formArea,
    }
  }

  const canonicalAssignmentsMatch = matchPath(
    '/admin/entity-config/:entityId/edit/layouts/:layoutId/assignments',
    pathname,
  )
  if (canonicalAssignmentsMatch?.params.entityId && canonicalAssignmentsMatch.params.layoutId) {
    return {
      entityId: decodeURIComponent(canonicalAssignmentsMatch.params.entityId),
      section: 'assignments',
      layoutId: decodeURIComponent(canonicalAssignmentsMatch.params.layoutId),
      detailArea: null,
      formArea: null,
    }
  }

  const detailMatch = matchPath('/admin/entity-config/:entityId/edit/detail/:detailArea', pathname)
  if (
    detailMatch?.params.entityId &&
    isEntityConfigDetailEditorArea(detailMatch.params.detailArea)
  ) {
    return {
      entityId: decodeURIComponent(detailMatch.params.entityId),
      section: 'detail',
      layoutId: null,
      detailArea: detailMatch.params.detailArea,
      formArea: null,
    }
  }

  const formMatch = matchPath('/admin/entity-config/:entityId/edit/form/:formArea', pathname)
  if (formMatch?.params.entityId && isEntityConfigFormEditorArea(formMatch.params.formArea)) {
    return {
      entityId: decodeURIComponent(formMatch.params.entityId),
      section: 'form',
      layoutId: null,
      detailArea: null,
      formArea: formMatch.params.formArea,
    }
  }

  const assignmentsMatch = matchPath('/admin/entity-config/:entityId/edit/assignments', pathname)
  if (assignmentsMatch?.params.entityId) {
    return {
      entityId: decodeURIComponent(assignmentsMatch.params.entityId),
      section: 'assignments',
      layoutId: null,
      detailArea: null,
      formArea: null,
    }
  }

  const sectionMatch = matchPath('/admin/entity-config/:entityId/edit/:section', pathname)
  if (
    sectionMatch?.params.entityId &&
    (sectionMatch.params.section === 'base' || sectionMatch.params.section === 'list')
  ) {
    return {
      entityId: decodeURIComponent(sectionMatch.params.entityId),
      section: sectionMatch.params.section,
      layoutId: null,
      detailArea: null,
      formArea: null,
    }
  }

  return null
}

export function isEntityConfigEditSessionPath(pathname: string, entityId: string): boolean {
  const editRoute = parseEntityConfigEditPath(pathname)
  return editRoute?.entityId === entityId
}
