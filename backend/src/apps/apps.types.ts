export type AppItemKind = 'home' | 'entity' | 'custom-page' | 'external-link' | 'report' | 'dashboard';

export type AppItemTargetType = 'app-item' | 'url';

export type AppUrlOpenMode = 'same-tab' | 'new-tab';

export type AppEmbedOpenMode = 'new-tab' | 'iframe';

export interface AppPageBlockLayout {
  colSpan: number;
  rowSpan: number;
}

interface AppPageBlockBase {
  id: string;
  layout: AppPageBlockLayout;
}

export interface AppPageHeroBlock {
  id: string;
  type: 'hero';
  layout: AppPageBlockLayout;
  title: string;
  body?: string;
  action?: AppPageAction;
}

export interface AppPageMarkdownBlock {
  id: string;
  type: 'markdown';
  layout: AppPageBlockLayout;
  markdown: string;
}

export interface AppPageLinkListBlock {
  id: string;
  type: 'link-list';
  layout: AppPageBlockLayout;
  title?: string;
  links: AppPageAction[];
}

export interface AppPageDashboardBlock extends AppPageBlockBase {
  type: 'dashboard';
  dashboardId: string;
}

export type AppPageBlock =
  | AppPageHeroBlock
  | AppPageMarkdownBlock
  | AppPageLinkListBlock
  | AppPageDashboardBlock;

export interface AppPageAction {
  label: string;
  targetType: AppItemTargetType;
  target: string;
  openMode?: AppUrlOpenMode;
}

export interface AppPageConfig {
  blocks: AppPageBlock[];
}

export interface AppItemBase {
  id: string;
  kind: AppItemKind;
  label: string;
  description?: string;
  resourceId?: string;
}

export interface AppHomeItemConfig extends Omit<AppItemBase, 'kind' | 'resourceId'> {
  kind: 'home';
  page: AppPageConfig;
}

export interface AppEntityItemConfig extends AppItemBase {
  kind: 'entity';
  entityId: string;
}

export interface AppCustomPageItemConfig extends AppItemBase {
  kind: 'custom-page';
  page: AppPageConfig;
}

export interface AppExternalLinkItemConfig extends AppItemBase {
  kind: 'external-link';
  url: string;
  openMode: AppEmbedOpenMode;
  iframeTitle?: string;
  height?: number;
}

export interface AppReportItemConfig extends AppItemBase {
  kind: 'report';
}

export interface AppDashboardItemConfig extends AppItemBase {
  kind: 'dashboard';
}

export type AppItemConfig =
  | AppHomeItemConfig
  | AppEntityItemConfig
  | AppCustomPageItemConfig
  | AppExternalLinkItemConfig
  | AppReportItemConfig
  | AppDashboardItemConfig;

export interface AppConfig {
  id: string;
  label: string;
  description?: string;
  sortOrder: number;
  items: AppItemConfig[];
  permissionCodes: string[];
}

export interface AppAdminSummary {
  id: string;
  label: string;
  description?: string;
  sortOrder: number;
  itemCount: number;
  entityCount: number;
  permissionCount: number;
  updatedAt: string;
}

export interface AppAdminListResponse {
  items: AppAdminSummary[];
}

export interface AppAdminResponse {
  app: AppConfig;
}

export interface AppHomeUpdateInput {
  label: string;
  description?: string;
  page: AppPageConfig;
}

export interface AppDashboardOption {
  id: string;
  label: string;
  folderId: string;
  folderLabel: string;
  sourceReportLabel: string;
  widgetCount: number;
  updatedAt: string;
}

export interface AppDashboardOptionsResponse {
  items: AppDashboardOption[];
}

export interface AvailableAppItemBase {
  id: string;
  kind: AppItemKind;
  label: string;
  description?: string;
  resourceId?: string;
}

export interface AvailableAppHomeItem extends Omit<AvailableAppItemBase, 'kind' | 'resourceId'> {
  kind: 'home';
  page: AppPageConfig;
}

export interface AvailableAppEntityItem extends AvailableAppItemBase {
  kind: 'entity';
  entityId: string;
  objectApiName: string;
  keyPrefix?: string;
}

export interface AvailableAppCustomPageItem extends AvailableAppItemBase {
  kind: 'custom-page';
  page: AppPageConfig;
}

export interface AvailableAppExternalLinkItem extends AvailableAppItemBase {
  kind: 'external-link';
  url: string;
  openMode: AppEmbedOpenMode;
  iframeTitle?: string;
  height?: number;
}

export interface AvailableAppReportItem extends AvailableAppItemBase {
  kind: 'report';
}

export interface AvailableAppDashboardItem extends AvailableAppItemBase {
  kind: 'dashboard';
}

export type AvailableAppItem =
  | AvailableAppHomeItem
  | AvailableAppEntityItem
  | AvailableAppCustomPageItem
  | AvailableAppExternalLinkItem
  | AvailableAppReportItem
  | AvailableAppDashboardItem;

export interface AvailableApp {
  id: string;
  label: string;
  description?: string;
  items: AvailableAppItem[];
}

export interface AppsAvailableResponse {
  items: AvailableApp[];
}
