import type { ReportFilterOperator, ReportShareGrant } from './report-types'

export type ReportRouteSelection =
  | { kind: 'workspace' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'report'; reportId: string }
  | { kind: 'invalid' }

export type FolderDraft = {
  label: string
  description: string
  accessMode: 'personal' | 'shared'
  shares: ReportShareGrant[]
}

export type ReportColumnDraft = {
  field: string
  label: string
}

export type ReportFilterDraft = {
  field: string
  operator: ReportFilterOperator
  valueText: string
}

export type ReportGroupingDraft = {
  field: string
  label: string
}

export type ReportSortDraft = {
  field: string
  direction: 'ASC' | 'DESC'
}

export type ReportDraft = {
  folderId: string
  label: string
  description: string
  objectApiName: string
  columns: ReportColumnDraft[]
  filters: ReportFilterDraft[]
  groupings: ReportGroupingDraft[]
  sort: ReportSortDraft[]
  pageSize: string
  shareMode: 'inherit' | 'restricted' | 'personal'
  shares: ReportShareGrant[]
}

export type FolderEditorState =
  | {
      mode: 'create'
      draft: FolderDraft
    }
  | {
      mode: 'edit'
      folderId: string
      draft: FolderDraft
    }

export const FILTER_OPERATORS: ReportFilterOperator[] = ['=', '!=', '<', '<=', '>', '>=', 'IN', 'NOT IN', 'LIKE']
export const EMPTY_SHARE: ReportShareGrant = { subjectType: 'permission', subjectId: '' }
