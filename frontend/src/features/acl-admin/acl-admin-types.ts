export type AclResourceType = 'rest' | 'entity' | 'query' | 'route'

export type AclPermissionDefinition = {
  code: string
  label?: string
  description?: string
  aliases?: string[]
}

export type AclResourceConfig = {
  id: string
  type: AclResourceType
  target?: string
  description?: string
  permissions: string[]
}

export type AclAdminPermissionSummary = {
  code: string
  label?: string
  description?: string
  aliases: string[]
  isDefault: boolean
  resourceCount: number
}

export type AclAdminPermissionListResponse = {
  items: AclAdminPermissionSummary[]
}

export type AclAdminPermissionResponse = {
  permission: AclPermissionDefinition & { aliases: string[] }
  isDefault: boolean
  resourceIds: string[]
  resourceCount: number
}

export type AclAdminResourceSummary = {
  id: string
  type: AclResourceType
  target?: string
  description?: string
  permissionCount: number
}

export type AclAdminResourceListResponse = {
  items: AclAdminResourceSummary[]
}

export type AclAdminResourceResponse = {
  resource: AclResourceConfig
}

export type AclAdminDefaultPermissionItem = {
  permissionCode: string
  label?: string
  description?: string
  enabled: boolean
}

export type AclAdminDefaultPermissionsResponse = {
  items: AclAdminDefaultPermissionItem[]
}
