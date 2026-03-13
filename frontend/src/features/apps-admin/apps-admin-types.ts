import type {
  AppEmbedOpenMode,
  AppItemKind,
  AppPageConfig,
} from '../apps/app-types'

export type AppItemBaseConfig = {
  id: string
  kind: AppItemKind
  label: string
  description?: string
  resourceId?: string
}

export type AppHomeItemConfig = Omit<AppItemBaseConfig, 'kind' | 'resourceId'> & {
  kind: 'home'
  page: AppPageConfig
}

export type AppEntityItemConfig = AppItemBaseConfig & {
  kind: 'entity'
  entityId: string
}

export type AppCustomPageItemConfig = AppItemBaseConfig & {
  kind: 'custom-page'
  page: AppPageConfig
}

export type AppExternalLinkItemConfig = AppItemBaseConfig & {
  kind: 'external-link'
  url: string
  openMode: AppEmbedOpenMode
  iframeTitle?: string
  height?: number
}

export type AppReportItemConfig = AppItemBaseConfig & {
  kind: 'report'
}

export type AppDashboardItemConfig = AppItemBaseConfig & {
  kind: 'dashboard'
}

export type AppItemConfig =
  | AppHomeItemConfig
  | AppEntityItemConfig
  | AppCustomPageItemConfig
  | AppExternalLinkItemConfig
  | AppReportItemConfig
  | AppDashboardItemConfig

export type AppConfig = {
  id: string
  label: string
  description?: string
  sortOrder: number
  items: AppItemConfig[]
  permissionCodes: string[]
}

export type AppAdminSummary = {
  id: string
  label: string
  description?: string
  sortOrder: number
  itemCount: number
  entityCount: number
  permissionCount: number
  updatedAt: string
}

export type AppAdminListResponse = {
  items: AppAdminSummary[]
}

export type AppAdminResponse = {
  app: AppConfig
}

export type AppDashboardOption = {
  id: string
  label: string
  folderId: string
  folderLabel: string
  sourceReportLabel: string
  widgetCount: number
  updatedAt: string
}

export type AppDashboardOptionsResponse = {
  items: AppDashboardOption[]
}
