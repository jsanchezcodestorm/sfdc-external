export type AppConfig = {
  id: string
  label: string
  description?: string
  sortOrder: number
  entityIds: string[]
  permissionCodes: string[]
}

export type AppAdminSummary = {
  id: string
  label: string
  description?: string
  sortOrder: number
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
