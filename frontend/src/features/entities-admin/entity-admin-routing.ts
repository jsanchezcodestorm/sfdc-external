import { matchPath } from 'react-router-dom'

import type { EntityConfigSectionKey } from './entity-admin-types'

export const NEW_ENTITY_SENTINEL = '__new__'
export const DEFAULT_ENTITY_CONFIG_DETAIL_EDITOR_AREA = 'header-query'
export const DEFAULT_ENTITY_CONFIG_FORM_EDITOR_AREA = 'header-query'

export const ENTITY_CONFIG_SECTION_ORDER: Array<
  Extract<EntityConfigSectionKey, 'object' | 'fields' | 'access' | 'record-types' | 'layouts' | 'preview'>
> = ['object', 'fields', 'access', 'record-types', 'layouts', 'preview']

export const ENTITY_CONFIG_SECTION_LABELS: Record<EntityConfigSectionKey, string> = {
  object: 'Object',
  fields: 'Fields',
  access: 'Access',
  'record-types': 'Record Types',
  layouts: 'Layouts',
  preview: 'Preview',
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
    value === 'object' ||
    value === 'fields' ||
    value === 'access' ||
    value === 'record-types' ||
    value === 'layouts' ||
    value === 'preview' ||
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
  section: 'object' | 'fields' | 'access' | 'record-types' | 'layouts' | 'preview',
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
  section: EntityConfigSectionKey = 'object',
  editorArea?: EntityConfigDetailEditorAreaKey | EntityConfigFormEditorAreaKey,
  layoutId?: string | null,
): string {
  const encodedEntityId = encodeURIComponent(entityId)
  const normalizedLayoutId =
    typeof layoutId === 'string' && layoutId.trim().length > 0
      ? encodeURIComponent(layoutId.trim())
      : 'default'

  if (section === 'detail') {
    const detailArea = isEntityConfigDetailEditorArea(editorArea)
      ? editorArea
      : DEFAULT_ENTITY_CONFIG_DETAIL_EDITOR_AREA

    return `/admin/entity-config/${encodedEntityId}/layouts/${normalizedLayoutId}/detail/${detailArea}`
  }

  if (section === 'form') {
    const formArea = isEntityConfigFormEditorArea(editorArea)
      ? editorArea
      : DEFAULT_ENTITY_CONFIG_FORM_EDITOR_AREA

    return `/admin/entity-config/${encodedEntityId}/layouts/${normalizedLayoutId}/form/${formArea}`
  }

  if (section === 'assignments') {
    return `/admin/entity-config/${encodedEntityId}/layouts/${normalizedLayoutId}/assignments`
  }

  return `/admin/entity-config/${encodedEntityId}/${section}`
}

export function buildEntityCreatePath(): string {
  return `/admin/entity-config/${NEW_ENTITY_SENTINEL}/object`
}

export function parseEntityConfigEditPath(pathname: string): EntityConfigEditRouteMatch | null {
  const detailMatch = matchPath('/admin/entity-config/:entityId/layouts/:layoutId/detail/:detailArea', pathname)
  if (detailMatch?.params.entityId && detailMatch.params.layoutId && isEntityConfigDetailEditorArea(detailMatch.params.detailArea)) {
    return {
      entityId: decodeURIComponent(detailMatch.params.entityId),
      section: 'detail',
      layoutId: decodeURIComponent(detailMatch.params.layoutId),
      detailArea: detailMatch.params.detailArea,
      formArea: null,
    }
  }

  const formMatch = matchPath('/admin/entity-config/:entityId/layouts/:layoutId/form/:formArea', pathname)
  if (formMatch?.params.entityId && formMatch.params.layoutId && isEntityConfigFormEditorArea(formMatch.params.formArea)) {
    return {
      entityId: decodeURIComponent(formMatch.params.entityId),
      section: 'form',
      layoutId: decodeURIComponent(formMatch.params.layoutId),
      detailArea: null,
      formArea: formMatch.params.formArea,
    }
  }

  const assignmentsMatch = matchPath('/admin/entity-config/:entityId/layouts/:layoutId/assignments', pathname)
  if (assignmentsMatch?.params.entityId && assignmentsMatch.params.layoutId) {
    return {
      entityId: decodeURIComponent(assignmentsMatch.params.entityId),
      section: 'assignments',
      layoutId: decodeURIComponent(assignmentsMatch.params.layoutId),
      detailArea: null,
      formArea: null,
    }
  }

  const sectionMatch = matchPath('/admin/entity-config/:entityId/:section', pathname)
  if (
    sectionMatch?.params.entityId &&
    (
      sectionMatch.params.section === 'object' ||
      sectionMatch.params.section === 'fields' ||
      sectionMatch.params.section === 'access' ||
      sectionMatch.params.section === 'record-types' ||
      sectionMatch.params.section === 'layouts' ||
      sectionMatch.params.section === 'preview'
    )
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
