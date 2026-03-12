import type { EntityAction, EntityConfig, RelatedListConfig } from '../../../entities/entity-types'
import type {
  DetailFieldDraft,
  DetailFormDraft,
  DetailSectionDraft,
  PathStatusStepDraft,
  RelatedListDraft,
} from './detail-form.types'

type DetailConfigValue = NonNullable<EntityConfig['detail']>
type DetailSectionValue = NonNullable<DetailConfigValue['sections']>[number]
type DetailFieldValue = DetailSectionValue['fields'][number]
type DetailPathStatusValue = NonNullable<DetailConfigValue['pathStatus']>
type DetailPathStatusStepValue = DetailPathStatusValue['steps'][number]

export function createEmptyDetailFormDraft(): DetailFormDraft {
  return {
    titleTemplate: '',
    fallbackTitle: '',
    subtitle: '',
    queryFields: [],
    queryWhereJson: '',
    queryOrderByJson: '',
    queryLimit: '',
    actionsJson: '',
    pathStatusEnabled: false,
    pathStatusField: '',
    pathStatusAllowUpdate: true,
    pathStatusSteps: [createEmptyPathStatusStepDraft()],
    sections: [createEmptyDetailSectionDraft()],
    relatedLists: [],
  }
}

export function createDetailFormDraft(
  detail: EntityConfig['detail'] | undefined,
): DetailFormDraft {
  if (!detail) {
    return createEmptyDetailFormDraft()
  }

  const query = detail.query
  const sections: DetailSectionDraft[] = (detail.sections ?? []).map((section) => ({
    clientId: createDetailDraftClientId('section'),
    title: section.title ?? '',
    fields:
      section.fields?.map((field) => ({
        clientId: createDetailDraftClientId('field'),
        label: field.label ?? '',
        field: field.field ?? '',
        template: field.template ?? '',
        sourceMode: typeof field.template === 'string' && field.template.trim().length > 0
          ? 'template'
          : 'field',
        highlight: Boolean(field.highlight),
        format:
          field.format === 'date' || field.format === 'datetime' ? field.format : '',
      })) ?? [],
  }))
  const relatedLists = (detail.relatedLists ?? []).map((relatedList) =>
    createRelatedListDraft(relatedList),
  )

  return {
    titleTemplate: detail.titleTemplate ?? '',
    fallbackTitle: detail.fallbackTitle ?? '',
    subtitle: detail.subtitle ?? '',
    queryFields: asStringArray(query?.fields),
    queryWhereJson: Array.isArray(query?.where) ? JSON.stringify(query.where, null, 2) : '',
    queryOrderByJson: Array.isArray(query?.orderBy)
      ? JSON.stringify(query.orderBy, null, 2)
      : '',
    queryLimit:
      typeof query?.limit === 'number' && Number.isFinite(query.limit)
        ? String(query.limit)
        : '',
    actionsJson: detail.actions ? JSON.stringify(detail.actions, null, 2) : '',
    pathStatusEnabled: Boolean(detail.pathStatus),
    pathStatusField: detail.pathStatus?.field ?? '',
    pathStatusAllowUpdate: detail.pathStatus?.allowUpdate ?? true,
    pathStatusSteps:
      detail.pathStatus?.steps?.map((step) => ({
        value: step.value ?? '',
        label: step.label ?? '',
      })) ?? [createEmptyPathStatusStepDraft()],
    sections: sections.length > 0 ? sections : [createEmptyDetailSectionDraft()],
    relatedLists,
  }
}

export function parseDetailFormDraft(
  draft: DetailFormDraft,
  baseObjectApiName: string,
): NonNullable<EntityConfig['detail']> {
  const normalizedBaseObjectApiName = readRequiredString(
    baseObjectApiName,
    'Base objectApiName obbligatorio per la sezione Detail',
  )
  const queryFields = draft.queryFields
    .map((field) => field.trim())
    .filter((field) => field.length > 0)

  if (queryFields.length === 0) {
    throw new Error('Detail: query.fields deve contenere almeno un campo')
  }

  const query: DetailConfigValue['query'] = {
    object: normalizedBaseObjectApiName,
    fields: queryFields,
  }

  const where = parseOptionalJsonArray(draft.queryWhereJson, 'Detail: query.where')
  if (where) {
    query.where = where as NonNullable<NonNullable<DetailConfigValue['query']>['where']>
  }

  const orderBy = parseOptionalJsonArray(draft.queryOrderByJson, 'Detail: query.orderBy')
  if (orderBy) {
    query.orderBy =
      orderBy as NonNullable<NonNullable<DetailConfigValue['query']>['orderBy']>
  }

  const queryLimit = parsePositiveInteger(draft.queryLimit, 'Detail: query.limit')
  if (queryLimit !== undefined) {
    query.limit = queryLimit
  }

  const fallbackFieldPath = pickPreferredField(queryFields)
  const sections = draft.sections
    .map((section, index) => parseDetailSectionDraft(section, index))
    .filter((section): section is DetailSectionValue => section !== null)

  if (sections.length === 0) {
    if (!fallbackFieldPath) {
      throw new Error('Detail: sections deve contenere almeno una sezione')
    }

    sections.push({
      title: 'Section 1',
      fields: [{ field: fallbackFieldPath }],
    })
  }

  const relatedLists = draft.relatedLists
    .map((relatedList, index) => parseRelatedListDraft(relatedList, index))
    .filter((relatedList): relatedList is RelatedListConfig => relatedList !== null)

  return {
    query,
    sections,
    relatedLists: relatedLists.length > 0 ? relatedLists : undefined,
    titleTemplate: readOptionalString(draft.titleTemplate),
    fallbackTitle: readOptionalString(draft.fallbackTitle),
    subtitle: readOptionalString(draft.subtitle),
    actions: parseOptionalJsonArray(draft.actionsJson, 'Detail: actions') as
      | EntityAction[]
      | undefined,
    pathStatus: draft.pathStatusEnabled ? parsePathStatusDraft(draft) : undefined,
  }
}

function parseDetailSectionDraft(
  section: DetailSectionDraft,
  index: number,
): DetailSectionValue | null {
  const title = readOptionalString(section.title) ?? `Section ${index + 1}`
  const fields = section.fields
    .map((field, fieldIndex) => parseDetailFieldDraft(field, index, fieldIndex))
    .filter((field): field is DetailFieldValue => field !== null)

  if (fields.length === 0) {
    throw new Error(
      `Detail section ${index + 1}: deve contenere almeno un field valorizzato (seleziona "Field" oppure imposta "Template")`,
    )
  }

  return {
    title,
    fields,
  }
}

function pickPreferredField(fields: string[]): string | undefined {
  const normalized = fields.map((field) => field.trim()).filter(Boolean)
  if (normalized.length === 0) {
    return undefined
  }

  const nameField = normalized.find((field) => field === 'Name')
  return nameField ?? normalized[0]
}

function parseDetailFieldDraft(
  field: DetailFieldDraft,
  sectionIndex: number,
  fieldIndex: number,
): DetailFieldValue | null {
  const label = readOptionalString(field.label)
  const fieldPath = readOptionalString(field.field)
  const template = readOptionalString(field.template)
  const format =
    field.format === 'date' || field.format === 'datetime' ? field.format : undefined

  const hasAnyValue = label || fieldPath || template || field.highlight || format
  if (!hasAnyValue) {
    return null
  }

  if (fieldPath && template) {
    throw new Error(
      `Detail section ${sectionIndex + 1} field ${fieldIndex + 1}: usa field oppure template, non entrambi`,
    )
  }

  if (!fieldPath && !template) {
    throw new Error(
      `Detail section ${sectionIndex + 1} field ${fieldIndex + 1}: field o template obbligatorio`,
    )
  }

  return {
    label,
    field: fieldPath,
    template,
    highlight: field.highlight ? true : undefined,
    format,
  }
}

function parsePathStatusDraft(draft: DetailFormDraft): DetailPathStatusValue {
  const field = readRequiredString(draft.pathStatusField, 'Path status: field obbligatorio')
  const steps = draft.pathStatusSteps
    .map((step, index) => parsePathStatusStepDraft(step, index))
    .filter((step): step is DetailPathStatusStepValue => step !== null)

  if (steps.length === 0) {
    throw new Error('Path status: serve almeno uno step')
  }

  return {
    field,
    steps,
    allowUpdate: draft.pathStatusAllowUpdate,
  }
}

function parsePathStatusStepDraft(
  step: PathStatusStepDraft,
  index: number,
): DetailPathStatusStepValue | null {
  const value = readOptionalString(step.value)
  const label = readOptionalString(step.label)

  if (!value && !label) {
    return null
  }

  if (!value) {
    throw new Error(`Path status step ${index + 1}: value obbligatorio`)
  }

  return {
    value,
    label,
  }
}

function parseRelatedListDraft(
  draft: RelatedListDraft,
  index: number,
): RelatedListConfig | null {
  const path = `Related list ${index + 1}`
  const id = readRequiredString(draft.id, `${path}: id obbligatorio`)
  const label = readRequiredString(draft.label, `${path}: label obbligatorio`)
  const objectApiName = readRequiredString(
    draft.objectApiName,
    `${path}: query.object obbligatorio`,
  )
  const queryFields = draft.queryFields
    .map((field) => field.trim())
    .filter((field) => field.length > 0)

  if (queryFields.length === 0) {
    throw new Error(`${path}: query.fields deve contenere almeno un campo`)
  }

  const query: NonNullable<RelatedListConfig['query']> = {
    object: objectApiName,
    fields: queryFields,
  }

  const where = parseOptionalJsonArray(draft.queryWhereJson, `${path}: query.where`)
  if (where) {
    query.where = where as NonNullable<NonNullable<RelatedListConfig['query']>['where']>
  }

  const orderBy = parseOptionalJsonArray(draft.queryOrderByJson, `${path}: query.orderBy`)
  if (orderBy) {
    query.orderBy = orderBy as NonNullable<NonNullable<RelatedListConfig['query']>['orderBy']>
  }

  const queryLimit = parsePositiveInteger(draft.queryLimit, `${path}: query.limit`)
  if (queryLimit !== undefined) {
    query.limit = queryLimit
  }

  const columns = parseColumnsDraft(draft.columns, path)
  const queryFieldSet = new Set(queryFields)
  const hasInvalidColumnField = columns.some((column) => {
    const field = typeof column === 'string' ? column : column.field
    return !queryFieldSet.has(field)
  })

  if (hasInvalidColumnField) {
    throw new Error(`${path}: columns può includere solo campi presenti in query.fields`)
  }

  return {
    id,
    label,
    description: readOptionalString(draft.description),
    entityId: readOptionalString(draft.entityId),
    query,
    columns,
    actions: parseOptionalJsonArray(draft.actionsJson, `${path}: actions`) as
      | EntityAction[]
      | undefined,
    rowActions: parseOptionalJsonArray(draft.rowActionsJson, `${path}: rowActions`) as
      | EntityAction[]
      | undefined,
    emptyState: readOptionalString(draft.emptyState),
    pageSize: parsePositiveInteger(draft.pageSize, `${path}: pageSize`),
  }
}

function createRelatedListDraft(relatedList: RelatedListConfig): RelatedListDraft {
  const query = relatedList.query

  return {
    id: relatedList.id ?? '',
    label: relatedList.label ?? '',
    description: relatedList.description ?? '',
    entityId: relatedList.entityId ?? '',
    objectApiName: typeof query?.object === 'string' ? query.object : '',
    queryFields: asStringArray(query?.fields),
    queryWhereJson: Array.isArray(query?.where) ? JSON.stringify(query.where, null, 2) : '',
    queryOrderByJson: Array.isArray(query?.orderBy)
      ? JSON.stringify(query.orderBy, null, 2)
      : '',
    queryLimit:
      typeof query?.limit === 'number' && Number.isFinite(query.limit)
        ? String(query.limit)
        : '',
    columns: formatColumnsDraft(relatedList.columns),
    actionsJson: relatedList.actions ? JSON.stringify(relatedList.actions, null, 2) : '',
    rowActionsJson: relatedList.rowActions
      ? JSON.stringify(relatedList.rowActions, null, 2)
      : '',
    emptyState: relatedList.emptyState ?? '',
    pageSize: typeof relatedList.pageSize === 'number' ? String(relatedList.pageSize) : '',
  }
}

function createEmptyPathStatusStepDraft(): PathStatusStepDraft {
  return {
    value: '',
    label: '',
  }
}

export function createEmptyDetailSectionDraft(
  title = '',
  preferredFieldPath?: string,
): DetailSectionDraft {
  return {
    clientId: createDetailDraftClientId('section'),
    title,
    fields: [createEmptyDetailFieldDraft(preferredFieldPath)],
  }
}

export function createEmptyDetailFieldDraft(preferredFieldPath?: string): DetailFieldDraft {
  return {
    clientId: createDetailDraftClientId('field'),
    label: '',
    field: preferredFieldPath?.trim() ?? '',
    template: '',
    sourceMode: 'field',
    highlight: false,
    format: '',
  }
}

let detailDraftClientIdCounter = 0

function createDetailDraftClientId(prefix: 'section' | 'field'): string {
  detailDraftClientIdCounter += 1
  return `${prefix}-${detailDraftClientIdCounter}`
}

function formatColumnsDraft(columns: RelatedListConfig['columns'] | undefined): string {
  if (!Array.isArray(columns) || columns.length === 0) {
    return ''
  }

  return columns
    .map((column) => {
      if (typeof column === 'string') {
        return column
      }

      const field = typeof column.field === 'string' ? column.field.trim() : ''
      const label = typeof column.label === 'string' ? column.label.trim() : ''

      if (!field) {
        return ''
      }

      return label ? `${field}|${label}` : field
    })
    .filter((line) => line.length > 0)
    .join('\n')
}

function parseColumnsDraft(
  value: string,
  label: string,
): NonNullable<RelatedListConfig['columns']> {
  const rows = value
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0)

  if (rows.length === 0) {
    throw new Error(`${label}: columns deve contenere almeno una riga`)
  }

  return rows.map((row) => {
    const [fieldPart, ...labelParts] = row.split('|')
    const field = fieldPart.trim()

    if (!field) {
      throw new Error(`${label}: formato columns non valido`)
    }

    const columnLabel = labelParts.join('|').trim()
    return columnLabel ? { field, label: columnLabel } : field
  })
}

function parseOptionalJsonArray(value: string, label: string): unknown[] | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON non valido'
    throw new Error(`${label}: ${message}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label}: deve essere un array JSON`)
  }

  return parsed
}

function parsePositiveInteger(value: string, label: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label}: deve essere un intero positivo`)
  }

  return parsed
}

function readRequiredString(value: string, errorMessage: string): string {
  const trimmed = readOptionalString(value)
  if (!trimmed) {
    throw new Error(errorMessage)
  }

  return trimmed
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
