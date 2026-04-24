import type { ReportShareGrant } from '../reports/report-types'
import type { DashboardFilterDefinition, DashboardWidgetDefinition } from './dashboard-types'

export type DashboardRouteSelection =
  | { kind: 'workspace' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'dashboard'; dashboardId: string }
  | { kind: 'invalid' }

export type FolderDraft = {
  label: string
  description: string
  accessMode: 'personal' | 'shared'
  shares: ReportShareGrant[]
}

export type DashboardDraft = {
  folderId: string
  sourceReportId: string
  label: string
  description: string
  filters: DashboardFilterDefinition[]
  widgets: DashboardWidgetDefinition[]
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

export type WidgetEditorKind = 'kpi' | 'chart' | 'table-grouped' | 'table-rows'

export const EMPTY_SHARE: ReportShareGrant = { subjectType: 'permission', subjectId: '' }
export const MAX_DASHBOARD_FILTERS = 3
