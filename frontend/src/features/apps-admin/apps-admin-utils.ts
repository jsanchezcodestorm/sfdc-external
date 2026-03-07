import type { AppConfig } from './apps-admin-types'

export type AppConfigDraft = {
  id: string
  label: string
  description: string
  sortOrder: string
  entityIds: string[]
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

export function createEmptyAppConfigDraft(): AppConfigDraft {
  return {
    id: '',
    label: '',
    description: '',
    sortOrder: '0',
    entityIds: [],
    permissionCodes: [],
  }
}

export function createAppConfigDraft(app: AppConfig): AppConfigDraft {
  return {
    id: app.id,
    label: app.label,
    description: app.description ?? '',
    sortOrder: String(app.sortOrder),
    entityIds: [...app.entityIds],
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

  const normalizedEntityIds = [...new Set(draft.entityIds.map((entityId) => entityId.trim()).filter(Boolean))]
  const normalizedPermissionCodes = [
    ...new Set(draft.permissionCodes.map((permissionCode) => permissionCode.trim()).filter(Boolean)),
  ]
  const rawSortOrder = draft.sortOrder.trim()
  const sortOrder = rawSortOrder.length === 0 ? 0 : Number.parseInt(rawSortOrder, 10)

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new Error('Sort order deve essere un intero >= 0')
  }

  return {
    id,
    label,
    description: draft.description.trim() || undefined,
    sortOrder,
    entityIds: normalizedEntityIds,
    permissionCodes: normalizedPermissionCodes,
  }
}
