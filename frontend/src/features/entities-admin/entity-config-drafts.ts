import type { EntityConfig } from '../entities/entity-types'
import {
  buildEntityEditPath,
  ENTITY_CONFIG_SECTION_LABELS,
  type EntityConfigDetailEditorAreaKey,
  type EntityConfigFormEditorAreaKey,
  NEW_ENTITY_SENTINEL,
} from './entity-admin-routing'
import type { EntityConfigSectionKey } from './entity-admin-types'
import {
  createDetailFormDraft,
  createEmptyDetailFormDraft,
  parseDetailFormDraft,
} from './components/detail-form/detail-form.mapper'
import type { DetailFormDraft } from './components/detail-form/detail-form.types'
import {
  createEmptyFormDraft,
  createFormDraft,
  parseFormDraft,
} from './components/form-form/form-form.mapper'
import type { FormFormDraft } from './components/form-form/form-form.types'
import {
  createEmptyListFormDraft,
  createListFormDraft,
  parseListFormDraft,
} from './list-form/list-form.mapper'
import type { ListFormDraft } from './list-form/list-form.types'

export type BaseFormDraft = {
  id: string
  label: string
  description: string
  objectApiName: string
  basePath: string
}

export type BaseFormDraftKey = keyof BaseFormDraft

export type EntityConfigDraftSnapshot = {
  base: BaseFormDraft
  list: ListFormDraft
  detail: DetailFormDraft
  form: FormFormDraft
}

export class EntityConfigDraftValidationError extends Error {
  section: EntityConfigSectionKey

  constructor(section: EntityConfigSectionKey, message: string) {
    super(message)
    this.name = 'EntityConfigDraftValidationError'
    this.section = section
  }
}

export function createEmptyEntityConfig(): EntityConfig {
  return {
    id: '',
    label: '',
    description: '',
    objectApiName: '',
    navigation: undefined,
    list: undefined,
    detail: undefined,
    form: undefined,
  }
}

export function createEmptyBaseFormDraft(): BaseFormDraft {
  return {
    id: '',
    label: '',
    description: '',
    objectApiName: '',
    basePath: '',
  }
}

export function createBaseFormDraft(entity: EntityConfig): BaseFormDraft {
  return {
    id: entity.id,
    label: entity.label ?? '',
    description: entity.description ?? '',
    objectApiName: entity.objectApiName ?? '',
    basePath: entity.navigation?.basePath ?? '',
  }
}

export function createBaseDraftFingerprint(baseDraft: BaseFormDraft): string {
  return JSON.stringify({
    id: baseDraft.id.trim(),
    label: baseDraft.label.trim(),
    description: baseDraft.description.trim(),
    objectApiName: baseDraft.objectApiName.trim(),
    basePath: baseDraft.basePath.trim(),
  })
}

export function toSuggestedEntityId(rawValue: string): string {
  return rawValue
    .trim()
    .replace(/__(c|r)$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildSuggestedEntityBasePath(entityId: string, objectApiName: string): string {
  const normalizedEntityId = toSuggestedEntityId(entityId)
  const normalizedObjectApiName = toSuggestedEntityId(objectApiName)
  const pathId = normalizedEntityId || normalizedObjectApiName

  if (!pathId) {
    return ''
  }

  return `/s/${pathId}`
}

export function countConfiguredColumns(columnsDraft: string): number {
  return columnsDraft
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0).length
}

export function pickDefaultListColumn(queryFields: string[]): string {
  const preferred = queryFields.find((field) => field === 'Name')
  return preferred ?? queryFields[0] ?? 'Id'
}

export function readLocationSaveInfo(state: unknown): string | null {
  if (!state || typeof state !== 'object') {
    return null
  }

  const value = (state as { saveInfo?: unknown }).saveInfo
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function createEntityConfigFromBaseDraft(baseDraft: BaseFormDraft): EntityConfig | null {
  const objectApiName = baseDraft.objectApiName.trim()
  const id = baseDraft.id.trim() || objectApiName
  const label = baseDraft.label.trim() || buildEntityLabelFromObjectApiName(objectApiName)

  if (objectApiName.length === 0 || id.length === 0 || label.length === 0) {
    return null
  }

  if (id === NEW_ENTITY_SENTINEL) {
    return null
  }

  return {
    id,
    label,
    description: readOptionalString(baseDraft.description),
    objectApiName,
    navigation:
      baseDraft.basePath.trim().length > 0
        ? { basePath: baseDraft.basePath.trim() }
        : undefined,
  }
}

export function createDraftSnapshot(entity: EntityConfig): EntityConfigDraftSnapshot {
  return {
    base: createBaseFormDraft(entity),
    list: createListFormDraft(entity.list),
    detail: createDetailFormDraft(entity.detail),
    form: createFormDraft(entity.form),
  }
}

export function serializeDraftSnapshot(snapshot: EntityConfigDraftSnapshot): string {
  return JSON.stringify(snapshot)
}

export function buildEntityConfigFromDrafts(
  persistedEntity: EntityConfig,
  drafts: EntityConfigDraftSnapshot,
): EntityConfig {
  const baseConfig = createEntityConfigFromBaseDraft(drafts.base)
  if (!baseConfig) {
    throw new EntityConfigDraftValidationError(
      'base',
      getPrefixedSectionMessage('base', getBaseDraftValidationMessage(drafts.base, 'salvare')),
    )
  }

  const baseObjectApiName = baseConfig.objectApiName ?? ''
  const list =
    persistedEntity.list !== undefined || !isListFormDraftEmpty(drafts.list)
      ? parseDraftSection('list', () => parseListFormDraft(drafts.list, baseObjectApiName))
      : undefined
  const detail =
    persistedEntity.detail !== undefined || !isDetailFormDraftEmpty(drafts.detail)
      ? parseDraftSection('detail', () => parseDetailFormDraft(drafts.detail, baseObjectApiName))
      : undefined
  const form =
    persistedEntity.form !== undefined || !isFormFormDraftEmpty(drafts.form)
      ? parseDraftSection('form', () => parseFormDraft(drafts.form, baseObjectApiName))
      : undefined

  return {
    ...baseConfig,
    list,
    detail,
    form,
  }
}

export function normalizeDraftValidationError(error: unknown): EntityConfigDraftValidationError {
  if (error instanceof EntityConfigDraftValidationError) {
    return error
  }

  return new EntityConfigDraftValidationError(
    'base',
    getPrefixedSectionMessage(
      'base',
      error instanceof Error ? error.message : 'Valori form non validi',
    ),
  )
}

export function getBaseDraftValidationMessage(
  baseDraft: BaseFormDraft,
  action: 'creare' | 'salvare' | 'generare il preset',
): string {
  const resolvedId = baseDraft.id.trim() || baseDraft.objectApiName.trim()

  if (resolvedId === NEW_ENTITY_SENTINEL) {
    return `Entity Id non puo essere ${NEW_ENTITY_SENTINEL}`
  }

  return `Compila objectApiName per ${action} la entity`
}

export function buildEntityEditPathForSection(
  entityId: string,
  section: EntityConfigSectionKey,
  detailArea: EntityConfigDetailEditorAreaKey | null,
  formArea: EntityConfigFormEditorAreaKey | null,
): string {
  if (section === 'detail') {
    return buildEntityEditPath(entityId, 'detail', detailArea ?? undefined)
  }

  if (section === 'form') {
    return buildEntityEditPath(entityId, 'form', formArea ?? undefined)
  }

  return buildEntityEditPath(entityId, section)
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function buildEntityLabelFromObjectApiName(objectApiName: string): string {
  const normalized = objectApiName
    .replace(/__(c|r)$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()

  return normalized.length > 0 ? normalized : objectApiName
}

function parseDraftSection<T>(
  section: EntityConfigSectionKey,
  parser: () => T,
): T {
  try {
    return parser()
  } catch (error) {
    const fallback = `Valori form non validi per la sezione ${ENTITY_CONFIG_SECTION_LABELS[section]}`
    throw new EntityConfigDraftValidationError(
      section,
      getPrefixedSectionMessage(
        section,
        error instanceof Error ? error.message : fallback,
      ),
    )
  }
}

function getPrefixedSectionMessage(
  section: EntityConfigSectionKey,
  message: string,
): string {
  const sectionLabel = ENTITY_CONFIG_SECTION_LABELS[section]
  const normalizedMessage = message.trim().toLowerCase()
  const normalizedLabel = sectionLabel.toLowerCase()
  const normalizedPrefix = `sezione ${normalizedLabel}`

  if (
    normalizedMessage.startsWith(normalizedPrefix) ||
    normalizedMessage.startsWith(`${normalizedLabel}:`) ||
    normalizedMessage.startsWith(`${normalizedLabel} `)
  ) {
    return message
  }

  return `Sezione ${sectionLabel}: ${message}`
}

function isListFormDraftEmpty(draft: ListFormDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(createEmptyListFormDraft())
}

function isDetailFormDraftEmpty(draft: DetailFormDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(createEmptyDetailFormDraft())
}

function isFormFormDraftEmpty(draft: FormFormDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(createEmptyFormDraft())
}
