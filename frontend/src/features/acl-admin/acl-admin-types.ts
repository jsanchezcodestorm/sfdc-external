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
  appCount: number
}

export type AclAdminPermissionListResponse = {
  items: AclAdminPermissionSummary[]
}

export type AclAdminPermissionResponse = {
  permission: AclPermissionDefinition & { aliases: string[] }
  isDefault: boolean
  resourceIds: string[]
  resourceCount: number
  appIds: string[]
  appCount: number
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

export type AclAdminContactPermissionSummary = {
  contactId: string
  permissionCodes: string[]
  permissionCount: number
  updatedAt: string
}

export type AclAdminContactPermissionListResponse = {
  items: AclAdminContactPermissionSummary[]
}

export type AclAdminContactPermission = {
  contactId: string
  permissionCodes: string[]
  updatedAt?: string
}

export type AclAdminContactPermissionResponse = {
  contactPermissions: AclAdminContactPermission
}

export type AclAdminContactSuggestion = {
  id: string
  name?: string
  recordTypeDeveloperName?: string
}

export type AclAdminContactSuggestionResponse = {
  items: AclAdminContactSuggestion[]
}
