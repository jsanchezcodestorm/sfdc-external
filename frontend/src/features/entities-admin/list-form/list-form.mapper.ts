import type {
  EntityAction,
  EntityListConfig,
  EntityListViewConfig,
} from '../../entities/entity-types'
import type {
  ListActionDraft,
  ListFormDraft,
  ListViewDraft,
} from './list-form.types'

export function createEmptyListFormDraft(): ListFormDraft {
  return {
    title: '',
    subtitle: '',
    primaryAction: createEmptyListActionDraft(),
    views: [createEmptyListViewDraft()],
  }
}

export function createListFormDraft(list: EntityListConfig | undefined): ListFormDraft {
  if (!list) {
    return createEmptyListFormDraft()
  }

  const views = (list.views ?? []).map((view) => createListViewDraft(view))

  return {
    title: list.title ?? '',
    subtitle: list.subtitle ?? '',
    primaryAction: createListActionDraft(list.primaryAction),
    views: views.length > 0 ? views : [createEmptyListViewDraft()],
  }
}

export function createEmptyListViewDraft(id = 'all'): ListViewDraft {
  return {
    id,
    label: '',
    description: '',
    default: false,
    pageSize: '',
    queryFields: [],
    queryWhereJson: '',
    queryOrderByJson: '',
    queryLimit: '',
    columns: '',
    searchFields: [],
    searchMinLength: '',
    primaryAction: createEmptyListActionDraft(),
    rowActionsJson: '',
  }
}

export function parseListFormDraft(
  draft: ListFormDraft,
  baseObjectApiName: string,
): EntityListConfig {
  const title = readRequiredString(draft.title, 'List title obbligatorio')
  const normalizedBaseObjectApiName = readRequiredString(
    baseObjectApiName,
    'Base objectApiName obbligatorio per la sezione List',
  )
  const views = draft.views.map((view, index) =>
    parseListViewDraft(view, index, normalizedBaseObjectApiName),
  )

  if (views.length === 0) {
    throw new Error('List deve contenere almeno una view')
  }

  return {
    title,
    subtitle: readOptionalString(draft.subtitle),
    primaryAction: parseListActionDraft(draft.primaryAction, 'List primaryAction'),
    views,
  }
}

function createListViewDraft(view: EntityListViewConfig): ListViewDraft {
  const query = view.query
  const queryFields = Array.isArray(query?.fields)
    ? query.fields
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : []
  const queryWhere = Array.isArray(query?.where) ? query.where : undefined
  const queryOrderBy = Array.isArray(query?.orderBy) ? query.orderBy : undefined
  const queryLimit =
    typeof query?.limit === 'number' && Number.isFinite(query.limit)
      ? query.limit
      : undefined

  return {
    id: view.id ?? '',
    label: view.label ?? '',
    description: view.description ?? '',
    default: Boolean(view.default),
    pageSize: typeof view.pageSize === 'number' ? String(view.pageSize) : '',
    queryFields,
    queryWhereJson: queryWhere ? JSON.stringify(queryWhere, null, 2) : '',
    queryOrderByJson: queryOrderBy ? JSON.stringify(queryOrderBy, null, 2) : '',
    queryLimit: queryLimit ? String(queryLimit) : '',
    columns: formatColumnsDraft(view.columns),
    searchFields: (view.search?.fields ?? []).filter(
      (field): field is string => typeof field === 'string',
    ),
    searchMinLength:
      typeof view.search?.minLength === 'number' ? String(view.search.minLength) : '',
    primaryAction: createListActionDraft(view.primaryAction),
    rowActionsJson: view.rowActions ? JSON.stringify(view.rowActions, null, 2) : '',
  }
}

function createEmptyListActionDraft(): ListActionDraft {
  return {
    type: '',
    label: '',
    target: '',
    entityId: '',
  }
}

function createListActionDraft(action: EntityAction | undefined): ListActionDraft {
  if (!action) {
    return createEmptyListActionDraft()
  }

  const type =
    action.type === 'edit' || action.type === 'delete' || action.type === 'link'
      ? action.type
      : ''

  return {
    type,
    label: action.label ?? '',
    target: action.target ?? '',
    entityId: action.entityId ?? '',
  }
}

function formatColumnsDraft(columns: EntityListViewConfig['columns'] | undefined): string {
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

function parseListViewDraft(
  draft: ListViewDraft,
  index: number,
  baseObjectApiName: string,
): EntityListViewConfig {
  const viewPath = `View ${index + 1}`
  const id = readRequiredString(draft.id, `${viewPath}: id obbligatorio`)
  const label = readRequiredString(draft.label, `${viewPath}: label obbligatorio`)

  const queryFields = draft.queryFields
    .map((field) => field.trim())
    .filter((field) => field.length > 0)
  if (queryFields.length === 0) {
    throw new Error(`${viewPath}: query.fields deve contenere almeno un campo`)
  }

  const query: NonNullable<EntityListViewConfig['query']> = {
    object: baseObjectApiName,
    fields: queryFields,
  }

  const where = parseOptionalJsonArray(draft.queryWhereJson, `${viewPath}: query.where`)
  if (where) {
    query.where = where as NonNullable<NonNullable<EntityListViewConfig['query']>['where']>
  }

  const orderBy = parseOptionalJsonArray(
    draft.queryOrderByJson,
    `${viewPath}: query.orderBy`,
  )
  if (orderBy) {
    query.orderBy =
      orderBy as NonNullable<NonNullable<EntityListViewConfig['query']>['orderBy']>
  }

  const queryLimit = parsePositiveInteger(draft.queryLimit, `${viewPath}: query.limit`)
  if (queryLimit !== undefined) {
    query.limit = queryLimit
  }

  const columns = parseColumnsDraft(draft.columns, viewPath)
  const queryFieldSet = new Set(queryFields)
  const hasInvalidColumnField = columns.some((column) => {
    const field = typeof column === 'string' ? column : column.field
    return !queryFieldSet.has(field)
  })
  if (hasInvalidColumnField) {
    throw new Error(`${viewPath}: columns può includere solo campi presenti in query.fields`)
  }

  const pageSize = parsePositiveInteger(draft.pageSize, `${viewPath}: pageSize`)
  const searchFields = draft.searchFields
    .map((field) => field.trim())
    .filter((field) => field.length > 0)
  const searchMinLength = parsePositiveInteger(
    draft.searchMinLength,
    `${viewPath}: search.minLength`,
  )
  const rowActions = parseOptionalJsonArray(draft.rowActionsJson, `${viewPath}: rowActions`)

  const search =
    searchFields.length > 0
      ? {
          fields: searchFields,
          minLength: searchMinLength,
        }
      : undefined

  return {
    id,
    label,
    description: readOptionalString(draft.description),
    default: draft.default ? true : undefined,
    pageSize,
    query,
    columns,
    search,
    primaryAction: parseListActionDraft(draft.primaryAction, `${viewPath}: primaryAction`),
    rowActions: rowActions as EntityListViewConfig['rowActions'],
  }
}

function parseListActionDraft(
  draft: ListActionDraft,
  label: string,
): EntityAction | undefined {
  const type = draft.type
  const actionLabel = readOptionalString(draft.label)
  const target = readOptionalString(draft.target)
  const entityId = readOptionalString(draft.entityId)

  const hasAnyValue = type.length > 0 || actionLabel || target || entityId
  if (!hasAnyValue) {
    return undefined
  }

  if (type !== 'edit' && type !== 'delete' && type !== 'link') {
    throw new Error(`${label}: type non valido`)
  }

  return {
    type,
    label: actionLabel,
    target,
    entityId,
  }
}

function parseColumnsDraft(value: string, label: string): EntityListViewConfig['columns'] {
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

    if (field.length === 0) {
      throw new Error(`${label}: formato columns non valido`)
    }

    const columnLabel = labelParts.join('|').trim()
    return columnLabel.length > 0 ? { field, label: columnLabel } : field
  })
}

function parseOptionalJsonArray(value: string, label: string): unknown[] | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
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
  if (trimmed.length === 0) {
    return undefined
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label}: deve essere un intero positivo`)
  }

  return parsed
}

function readRequiredString(value: string, errorMessage: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
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
