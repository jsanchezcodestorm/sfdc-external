import type {
  EntityColumn,
  EntityRecord,
  EntityAction,
} from './entity-types'

export function getRecordId(record: EntityRecord): string {
  const raw = record.Id ?? record.id ?? record.recordId
  return typeof raw === 'string' ? raw : ''
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

export function buildRowActions(actions: EntityAction[] | undefined): EntityAction[] {
  if (actions && actions.length > 0) {
    return actions
  }

  return [
    { type: 'edit', label: 'Edit' },
    { type: 'delete', label: 'Delete' },
  ]
}
