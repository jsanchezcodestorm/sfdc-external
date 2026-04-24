import type {
  ReportColumn,
  ReportDefinition,
  ReportFilter,
  ReportFilterOperator,
  ReportFolderSummary,
  ReportGrouping,
  ReportScalarValue,
  ReportShareGrant,
  ReportSort,
  UpsertReportFolderPayload,
  UpsertReportPayload,
} from './report-types'
import type { FolderDraft, ReportDraft } from './report-workspace-model'

export function createEmptyFolderDraft(): FolderDraft {
  return {
    label: '',
    description: '',
    accessMode: 'personal',
    shares: [],
  }
}

export function createFolderDraftFromSummary(folder: ReportFolderSummary): FolderDraft {
  return {
    label: folder.label,
    description: folder.description ?? '',
    accessMode: folder.accessMode,
    shares: folder.shares.map((share) => ({ ...share })),
  }
}

export function folderDraftToPayload(draft: FolderDraft): UpsertReportFolderPayload {
  const label = draft.label.trim()
  if (!label) {
    throw new Error('Label cartella obbligatoria')
  }

  const shares = draft.shares.filter(hasShareSubject)
  if (draft.accessMode === 'shared' && shares.length === 0) {
    throw new Error('Le cartelle condivise richiedono almeno uno share grant')
  }

  return {
    folder: {
      label,
      description: draft.description.trim() || undefined,
      accessMode: draft.accessMode,
      shares,
    },
  }
}

export function createEmptyReportDraft(folderId = ''): ReportDraft {
  return {
    folderId,
    label: '',
    description: '',
    objectApiName: '',
    columns: [{ field: 'Id', label: '' }],
    filters: [],
    groupings: [],
    sort: [],
    pageSize: '50',
    shareMode: 'inherit',
    shares: [],
  }
}

export function createReportDraftFromDefinition(report: ReportDefinition): ReportDraft {
  return {
    folderId: report.folderId,
    label: report.label,
    description: report.description ?? '',
    objectApiName: report.objectApiName,
    columns: report.columns.map((column) => ({ field: column.field, label: column.label ?? '' })),
    filters: report.filters.map((filter) => ({
      field: filter.field,
      operator: filter.operator,
      valueText: serializeDraftFilterValue(filter.value),
    })),
    groupings: report.groupings.map((grouping) => ({ field: grouping.field, label: grouping.label ?? '' })),
    sort: report.sort.map((sortEntry) => ({
      field: sortEntry.field,
      direction: sortEntry.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
    })),
    pageSize: String(report.pageSize),
    shareMode: report.shareMode,
    shares: report.shares.map((share) => ({ ...share })),
  }
}

export function reportDraftToPayload(draft: ReportDraft): UpsertReportPayload {
  const folderId = draft.folderId.trim()
  const label = draft.label.trim()
  const objectApiName = draft.objectApiName.trim()

  if (!folderId) {
    throw new Error('Folder obbligatoria')
  }

  if (!label) {
    throw new Error('Label report obbligatoria')
  }

  if (!objectApiName) {
    throw new Error('Object API Name obbligatorio')
  }

  const columns = draft.columns
    .map((column) => ({
      field: column.field.trim(),
      label: column.label.trim() || undefined,
    }))
    .filter((column) => column.field.length > 0) as ReportColumn[]

  if (columns.length === 0) {
    throw new Error('Il report richiede almeno una colonna')
  }

  const groupings = draft.groupings
    .map((grouping) => ({
      field: grouping.field.trim(),
      label: grouping.label.trim() || undefined,
    }))
    .filter((grouping) => grouping.field.length > 0) as ReportGrouping[]

  if (groupings.length > 2) {
    throw new Error('Il report supporta al massimo due livelli di grouping')
  }

  const filters = draft.filters
    .map((filter) => {
      const field = filter.field.trim()
      if (!field) {
        return null
      }

      return {
        field,
        operator: filter.operator,
        value: parseDraftFilterValue(filter.valueText, filter.operator),
      } satisfies ReportFilter
    })
    .filter((entry): entry is ReportFilter => entry !== null)

  const sort = draft.sort
    .map((sortEntry) => ({
      field: sortEntry.field.trim(),
      direction: sortEntry.direction,
    }))
    .filter((sortEntry) => sortEntry.field.length > 0) as ReportSort[]

  const pageSize = Number.parseInt(draft.pageSize.trim(), 10)
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 2000) {
    throw new Error('Page size deve essere un intero tra 1 e 2000')
  }

  const shares = draft.shares.filter(hasShareSubject)
  if (draft.shareMode === 'restricted' && shares.length === 0) {
    throw new Error('Share mode restricted richiede almeno uno share grant')
  }

  return {
    report: {
      folderId,
      label,
      description: draft.description.trim() || undefined,
      objectApiName,
      columns,
      filters,
      groupings,
      sort,
      pageSize,
      shareMode: draft.shareMode,
      shares,
    },
  }
}

export function hasShareSubject(share: ReportShareGrant): boolean {
  return share.subjectId.trim().length > 0
}

function parseDraftFilterValue(
  valueText: string,
  operator: ReportFilterOperator,
): ReportScalarValue | ReportScalarValue[] {
  if (operator === 'IN' || operator === 'NOT IN') {
    const items = valueText
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map(parseScalarToken)

    if (items.length === 0) {
      throw new Error(`Il filtro ${operator} richiede almeno un valore`)
    }

    return items
  }

  return parseScalarToken(valueText.trim())
}

function parseScalarToken(value: string): ReportScalarValue {
  const normalized = value.trim()
  if (!normalized || normalized.toLowerCase() === 'null') {
    return null
  }

  if (normalized.toLowerCase() === 'true') {
    return true
  }

  if (normalized.toLowerCase() === 'false') {
    return false
  }

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return Number(normalized)
  }

  return normalized
}

function serializeDraftFilterValue(value: ReportFilter['value']): string {
  if (Array.isArray(value)) {
    return value.map(serializeScalarValue).join(', ')
  }

  return serializeScalarValue(value)
}

function serializeScalarValue(value: ReportScalarValue): string {
  if (value === null) {
    return 'null'
  }

  return String(value)
}
