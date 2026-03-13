export type AppItemKind = 'home' | 'entity' | 'custom-page' | 'external-link' | 'report' | 'dashboard'

export type AppItemTargetType = 'app-item' | 'url'

export type AppUrlOpenMode = 'same-tab' | 'new-tab'

export type AppEmbedOpenMode = 'new-tab' | 'iframe'

export type AppPageAction = {
  label: string
  targetType: AppItemTargetType
  target: string
  openMode?: AppUrlOpenMode
}

export type AppPageHeroBlock = {
  type: 'hero'
  title: string
  body?: string
  action?: AppPageAction
}

export type AppPageMarkdownBlock = {
  type: 'markdown'
  markdown: string
}

export type AppPageLinkListBlock = {
  type: 'link-list'
  title?: string
  links: AppPageAction[]
}

export type AppPageBlock = AppPageHeroBlock | AppPageMarkdownBlock | AppPageLinkListBlock

export type AppPageConfig = {
  blocks: AppPageBlock[]
}

export type AvailableAppItemBase = {
  id: string
  kind: AppItemKind
  label: string
  description?: string
  resourceId?: string
}

export type AvailableAppHomeItem = Omit<AvailableAppItemBase, 'kind' | 'resourceId'> & {
  kind: 'home'
  page: AppPageConfig
}

export type AvailableAppEntityItem = AvailableAppItemBase & {
  kind: 'entity'
  entityId: string
  objectApiName: string
  keyPrefix?: string
}

export type AvailableAppCustomPageItem = AvailableAppItemBase & {
  kind: 'custom-page'
  page: AppPageConfig
}

export type AvailableAppExternalLinkItem = AvailableAppItemBase & {
  kind: 'external-link'
  url: string
  openMode: AppEmbedOpenMode
  iframeTitle?: string
  height?: number
}

export type AvailableAppReportItem = AvailableAppItemBase & {
  kind: 'report'
}

export type AvailableAppDashboardItem = AvailableAppItemBase & {
  kind: 'dashboard'
}

export type AvailableAppItem =
  | AvailableAppHomeItem
  | AvailableAppEntityItem
  | AvailableAppCustomPageItem
  | AvailableAppExternalLinkItem
  | AvailableAppReportItem
  | AvailableAppDashboardItem

export type AvailableApp = {
  id: string
  label: string
  description?: string
  items: AvailableAppItem[]
}

export type AvailableAppsResponse = {
  items: AvailableApp[]
}
