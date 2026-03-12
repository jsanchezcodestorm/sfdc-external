import type { AppConfig, AppItemConfig } from './apps-admin-types'
import type { AppEmbedOpenMode, AppItemKind, AppPageConfig } from '../apps/app-types'

export type AppItemDraft = {
  id: string
  kind: AppItemKind
  label: string
  description: string
  resourceId: string
  entityId: string
  pageJson: string
  url: string
  openMode: AppEmbedOpenMode
  iframeTitle: string
  height: string
}

export type AppConfigDraft = {
  id: string
  label: string
  description: string
  sortOrder: string
  items: AppItemDraft[]
  permissionCodes: string[]
}

export function buildAppsAdminListPath(): string {
  return '/admin/apps'
}

export function buildAppsAdminCreatePath(): string {
  return '/admin/apps/__new__'
}

export function buildAppsAdminViewPath(appId: string): string {
  return `/admin/apps/${encodeURIComponent(appId)}`
}

export function buildAppsAdminEditPath(appId: string): string {
  return `/admin/apps/${encodeURIComponent(appId)}/edit`
}

export function createEmptyAppItemDraft(kind: AppItemKind = 'custom-page'): AppItemDraft {
  return {
    id: kind === 'home' ? 'home' : '',
    kind,
    label: kind === 'home' ? 'Home' : '',
    description: '',
    resourceId: '',
    entityId: '',
    pageJson: JSON.stringify(createEmptyPageConfig(), null, 2),
    url: '',
    openMode: 'new-tab',
    iframeTitle: '',
    height: '',
  }
}

export function createEmptyAppConfigDraft(): AppConfigDraft {
  return {
    id: '',
    label: '',
    description: '',
    sortOrder: '0',
    items: [createEmptyAppItemDraft('home')],
    permissionCodes: [],
  }
}

export function createAppItemDraft(item: AppItemConfig): AppItemDraft {
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    description: item.description ?? '',
    resourceId: 'resourceId' in item ? item.resourceId ?? '' : '',
    entityId: item.kind === 'entity' ? item.entityId : '',
    pageJson:
      item.kind === 'home' || item.kind === 'custom-page'
        ? JSON.stringify(item.page, null, 2)
        : JSON.stringify(createEmptyPageConfig(), null, 2),
    url: item.kind === 'external-link' ? item.url : '',
    openMode: item.kind === 'external-link' ? item.openMode : 'new-tab',
    iframeTitle: item.kind === 'external-link' ? item.iframeTitle ?? '' : '',
    height: item.kind === 'external-link' ? String(item.height ?? '') : '',
  }
}

export function createAppConfigDraft(app: AppConfig): AppConfigDraft {
  return {
    id: app.id,
    label: app.label,
    description: app.description ?? '',
    sortOrder: String(app.sortOrder),
    items: app.items.map((item) => createAppItemDraft(item)),
    permissionCodes: [...app.permissionCodes],
  }
}

export function parseAppConfigDraft(draft: AppConfigDraft): AppConfig {
  const id = draft.id.trim()
  if (!id) {
    throw new Error('App ID obbligatorio')
  }

  const label = draft.label.trim()
  if (!label) {
    throw new Error('Label obbligatoria')
  }

  const rawSortOrder = draft.sortOrder.trim()
  const sortOrder = rawSortOrder.length === 0 ? 0 : Number.parseInt(rawSortOrder, 10)

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new Error('Sort order deve essere un intero >= 0')
  }

  const items = draft.items.map((item, index) => parseAppItemDraft(item, index))
  const normalizedPermissionCodes = [
    ...new Set(draft.permissionCodes.map((permissionCode) => permissionCode.trim()).filter(Boolean)),
  ]

  return {
    id,
    label,
    description: draft.description.trim() || undefined,
    sortOrder,
    items,
    permissionCodes: normalizedPermissionCodes,
  }
}

function parseAppItemDraft(draft: AppItemDraft, index: number): AppItemConfig {
  const id = draft.id.trim()
  if (!id) {
    throw new Error(`Item ${index + 1}: ID obbligatorio`)
  }

  const label = draft.label.trim()
  if (!label) {
    throw new Error(`Item ${index + 1}: label obbligatoria`)
  }

  const resourceId = draft.resourceId.trim() || undefined
  const description = draft.description.trim() || undefined

  switch (draft.kind) {
    case 'home':
      return {
        id,
        kind: 'home',
        label,
        description,
        page: parsePageJson(draft.pageJson, index),
      }
    case 'entity': {
      const entityId = draft.entityId.trim()
      if (!entityId) {
        throw new Error(`Item ${index + 1}: entityId obbligatorio`)
      }

      return {
        id,
        kind: 'entity',
        label,
        description,
        resourceId,
        entityId,
      }
    }
    case 'custom-page':
      return {
        id,
        kind: 'custom-page',
        label,
        description,
        resourceId,
        page: parsePageJson(draft.pageJson, index),
      }
    case 'external-link':
      return {
        id,
        kind: 'external-link',
        label,
        description,
        resourceId,
        url: requireValue(draft.url, `Item ${index + 1}: URL obbligatoria`),
        openMode: draft.openMode,
        iframeTitle: draft.iframeTitle.trim() || undefined,
        height: parseOptionalHeight(draft.height, index),
      }
    case 'report':
      return {
        id,
        kind: 'report',
        label,
        description,
        resourceId,
      }
  }
}

function parsePageJson(value: string, index: number): AppPageConfig {
  const trimmed = value.trim()
  if (!trimmed) {
    return createEmptyPageConfig()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON non valido'
    throw new Error(`Item ${index + 1}: page JSON non valido (${message})`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Item ${index + 1}: page JSON deve essere un oggetto`)
  }

  return parsed as AppPageConfig
}

function parseOptionalHeight(value: string, index: number): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Item ${index + 1}: height deve essere un intero > 0`)
  }

  return parsed
}

function requireValue(value: string, message: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(message)
  }

  return normalized
}

function createEmptyPageConfig(): AppPageConfig {
  return {
    blocks: [],
  }
}
