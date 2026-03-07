import type {
  EntityAction,
  EntityColumn,
  EntityListConfig,
  EntityListViewConfig,
  EntityRecord,
} from './entity-types'

const ACTION_TYPES = new Set(['edit', 'delete', 'link'])

export function getRecordId(record: EntityRecord): string {
  const raw = record.Id ?? record.id ?? record.recordId
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw
  }

  const attributes = record.attributes
  if (!attributes || typeof attributes !== 'object') {
    return ''
  }

  const rawUrl = (attributes as Record<string, unknown>).url
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return ''
  }

  const candidate = rawUrl.split('/').filter(Boolean).at(-1) ?? ''
  return /^[a-zA-Z0-9]{15,18}$/.test(candidate) ? candidate : ''
}

export function toColumns(columns: Array<EntityColumn | string>): EntityColumn[] {
  return columns
    .map((column) => {
      if (typeof column === 'string') {
        return {
          field: column,
          label: toLabel(column),
        }
      }

      return {
        field: column.field,
        label: column.label ?? toLabel(column.field),
      }
    })
    .filter((column) => column.field.length > 0)
}

export function toTitleCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

export function toLabel(field: string): string {
  const cleaned = field.endsWith('Id') && field.length > 2 ? field.slice(0, -2) : field
  return toTitleCase(cleaned)
}

export function getRecordsFromCollection(payload: {
  records?: EntityRecord[]
  items?: EntityRecord[]
  data?: EntityRecord[]
}): EntityRecord[] {
  return payload.records ?? payload.items ?? payload.data ?? []
}

export function resolveFieldValue(record: EntityRecord, fieldPath: string): unknown {
  const segments = fieldPath.split('.').filter(Boolean)

  let current: unknown = record

  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

export function resolveDisplayFieldValue(record: EntityRecord, fieldPath: string): unknown {
  const directValue = resolveFieldValue(record, fieldPath)
  if (fieldPath.includes('.')) {
    return directValue
  }

  const relationshipPath = resolveLookupRelationshipPath(fieldPath)
  if (!relationshipPath) {
    return directValue
  }

  const relatedRecord = resolveFieldValue(record, relationshipPath)
  if (relatedRecord && typeof relatedRecord === 'object') {
    for (const candidate of lookupDisplayFieldCandidates()) {
      const value = (relatedRecord as Record<string, unknown>)[candidate]
      if (value !== null && value !== undefined && String(value).trim().length > 0) {
        return value
      }
    }
  }

  return directValue
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-'
  }

  if (typeof value === 'string') {
    return value.length > 0 ? value : '-'
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => formatFieldValue(item)).join(', ') : '-'
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function formatFieldValueByFormat(value: unknown, format: 'date' | 'datetime' | undefined): string {
  if (!format) {
    return formatFieldValue(value)
  }

  if (value === null || value === undefined) {
    return '-'
  }

  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) {
    return formatFieldValue(value)
  }

  if (format === 'date') {
    return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(date)
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function renderRecordTemplate(template: string, record: EntityRecord): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawExpr: string) => {
    const candidates = rawExpr
      .split('||')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)

    for (const candidate of candidates) {
      const value = resolveFieldValue(record, candidate)
      if (value !== null && value !== undefined && String(value).trim().length > 0) {
        return String(value)
      }
    }

    return ''
  })
}

export function normalizeEntityBasePath(entityId: string, configuredBasePath?: string): string {
  const normalizedConfigPath = configuredBasePath?.trim()
  if (!normalizedConfigPath) {
    return `/s/${entityId}`
  }

  const withLeadingSlash = normalizedConfigPath.startsWith('/')
    ? normalizedConfigPath
    : `/${normalizedConfigPath}`

  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '')
  return withoutTrailingSlash.length > 0 ? withoutTrailingSlash : '/'
}

export function selectListView(
  listConfig: EntityListConfig | undefined,
  requestedViewId: string | undefined,
): EntityListViewConfig | undefined {
  const views = listConfig?.views ?? []
  if (views.length === 0) {
    return undefined
  }

  const requested = requestedViewId?.trim()
  if (requested) {
    const requestedView = views.find((view) => view.id === requested)
    if (requestedView) {
      return requestedView
    }
  }

  const defaultView = views.find((view) => view.default === true)
  return defaultView ?? views[0]
}

export function resolveActionTarget(
  action: EntityAction,
  options: {
    baseEntityPath: string
    fallbackPath: string
    record?: EntityRecord
    rowId?: string
  },
): string {
  const actionBasePath = action.entityId
    ? normalizeEntityBasePath(action.entityId)
    : options.baseEntityPath

  const fallbackPath = toActionPath(options.fallbackPath, actionBasePath)
  const rawTarget = action.target?.trim()

  if (!rawTarget) {
    return fallbackPath
  }

  const templateRecord = buildTemplateRecord(options.record, options.rowId)
  const renderedTarget = renderRecordTemplate(rawTarget, templateRecord).trim()
  if (!renderedTarget) {
    return fallbackPath
  }

  if (renderedTarget.startsWith('http://') || renderedTarget.startsWith('https://')) {
    return renderedTarget
  }

  return toActionPath(renderedTarget, actionBasePath)
}

export function buildRowActions(actions: EntityAction[] | undefined): EntityAction[] {
  if (!actions || actions.length === 0) {
    return []
  }

  return actions.filter((action) => ACTION_TYPES.has(action.type))
}

function toActionPath(target: string, baseEntityPath: string): string {
  const normalizedTarget = target.trim()
  if (normalizedTarget.startsWith('/')) {
    return normalizedTarget
  }

  const normalizedBase = baseEntityPath.replace(/\/+$/, '')
  const normalizedRelative = normalizedTarget.replace(/^\/+/, '')

  if (!normalizedRelative) {
    return normalizedBase
  }

  return `${normalizedBase}/${normalizedRelative}`
}

function buildTemplateRecord(record: EntityRecord | undefined, rowId: string | undefined): EntityRecord {
  if (!rowId) {
    return record ?? {}
  }

  const baseRecord = record ?? {}
  const currentId = getRecordId(baseRecord)
  if (currentId.length > 0) {
    return baseRecord
  }

  return {
    ...baseRecord,
    Id: rowId,
    id: rowId,
    recordId: rowId,
  }
}

function resolveLookupRelationshipPath(fieldPath: string): string | null {
  if (fieldPath.endsWith('__c') && fieldPath.length > 3) {
    return `${fieldPath.slice(0, -3)}__r`
  }

  if (fieldPath.endsWith('Id') && fieldPath.length > 2) {
    return fieldPath.slice(0, -2)
  }

  return null
}

function lookupDisplayFieldCandidates(): string[] {
  return ['Name', 'CaseNumber', 'Subject', 'Title']
}
