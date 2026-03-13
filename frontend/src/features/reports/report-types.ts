export type ReportFilterOperator =
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'IN'
  | 'NOT IN'
  | 'LIKE'

export type ReportScalarValue = string | number | boolean | null

export type ReportFilter = {
  field: string
  operator: ReportFilterOperator
  value: ReportScalarValue | ReportScalarValue[]
}

export type ReportColumn = {
  field: string
  label?: string
}

export type ReportGrouping = {
  field: string
  label?: string
}

export type ReportSort = {
  field: string
  direction?: 'ASC' | 'DESC'
}

export type ReportShareGrant = {
  subjectType: 'contact' | 'permission'
  subjectId: string
}

export type ReportFolderSummary = {
  id: string
  appId: string
  label: string
  description?: string
  ownerContactId: string
  accessMode: 'personal' | 'shared'
  shares: ReportShareGrant[]
  reportCount: number
  canEdit: boolean
  canShare: boolean
  updatedAt: string
}

export type ReportSummary = {
  id: string
  appId: string
  folderId: string
  label: string
  description?: string
  ownerContactId: string
  objectApiName: string
  columns: ReportColumn[]
  groupings: ReportGrouping[]
  shareMode: 'inherit' | 'restricted' | 'personal'
  canEdit: boolean
  canShare: boolean
  updatedAt: string
}

export type ReportDefinition = ReportSummary & {
  filters: ReportFilter[]
  sort: ReportSort[]
  pageSize: number
  shares: ReportShareGrant[]
}

export type ReportsWorkspaceResponse = {
  appId: string
  canWrite: boolean
  folders: ReportFolderSummary[]
}

export type ReportFolderResponse = {
  canWrite: boolean
  folder: ReportFolderSummary
  reports: ReportSummary[]
}

export type ReportResponse = {
  canWrite: boolean
  report: ReportDefinition
}

export type ReportRunColumn = {
  field: string
  label: string
}

export type ReportRunRow = {
  id: string
  values: Record<string, unknown>
}

export type ReportRunGroupNode = {
  key: string
  field: string
  label: string
  value: unknown
  count: number
  children?: ReportRunGroupNode[]
  rowIds?: string[]
}

export type ReportRunResponse = {
  report: ReportDefinition
  columns: ReportRunColumn[]
  rows: ReportRunRow[]
  groups: ReportRunGroupNode[]
  total: number
  pageSize: number
  nextCursor: string | null
  visibility: Record<string, unknown>
}

export type ReportContactSuggestion = {
  id: string
  name?: string
  recordTypeDeveloperName?: string
}

export type ReportPermissionSuggestion = {
  code: string
  label?: string
}

export type ReportObjectSuggestion = {
  name: string
  label: string
  custom: boolean
}

export type ReportFieldSuggestion = {
  name: string
  label: string
  type: string
  filterable: boolean
}

export type ReportContactSuggestionResponse = {
  items: ReportContactSuggestion[]
}

export type ReportPermissionSuggestionResponse = {
  items: ReportPermissionSuggestion[]
}

export type ReportObjectSuggestionResponse = {
  items: ReportObjectSuggestion[]
}

export type ReportFieldSuggestionResponse = {
  items: ReportFieldSuggestion[]
}

export type UpsertReportFolderPayload = {
  folder: {
    label: string
    description?: string
    accessMode: 'personal' | 'shared'
    shares: ReportShareGrant[]
  }
}

export type UpsertReportPayload = {
  report: {
    folderId: string
    label: string
    description?: string
    objectApiName: string
    columns: ReportColumn[]
    filters: ReportFilter[]
    groupings: ReportGrouping[]
    sort: ReportSort[]
    pageSize: number
    shareMode: 'inherit' | 'restricted' | 'personal'
    shares: ReportShareGrant[]
  }
}
