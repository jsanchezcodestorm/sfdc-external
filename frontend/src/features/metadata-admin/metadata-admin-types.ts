export type MetadataSectionName =
  | 'entities'
  | 'apps'
  | 'acl'
  | 'aclContactPermissions'
  | 'queryTemplates'
  | 'visibility'
  | 'authProviders'
  | 'localCredentials'

export type MetadataTypeName =
  | 'EntityConfig'
  | 'AppConfig'
  | 'AclPermission'
  | 'AclResource'
  | 'AclDefaultPermission'
  | 'AclContactPermission'
  | 'QueryTemplate'
  | 'VisibilityCone'
  | 'VisibilityRule'
  | 'VisibilityAssignment'
  | 'AuthProvider'
  | 'LocalCredential'

export type MetadataPreviewChange = 'create' | 'update' | 'unchanged'

export type MetadataPreviewItem = {
  typeName: MetadataTypeName
  member: string
  path: string
  category: 'deployable' | 'manual'
  change: MetadataPreviewChange
  warnings: string[]
  blockers: string[]
}

export type MetadataPackageDescriptor = {
  version: number
  format: string
  contactMapping: 'email'
  secretPolicy: 'none'
  deployMode: 'upsert'
  types: Array<{
    name: MetadataTypeName
    members: string[]
  }>
  manualTypes: Array<{
    name: MetadataTypeName
    members: string[]
  }>
}

export type MetadataPreviewResponse = {
  package: MetadataPackageDescriptor
  packageHash: string
  targetFingerprint: string
  hasBlockers: boolean
  hasDeployableEntries: boolean
  warnings: string[]
  blockers: string[]
  manualActions: string[]
  items: MetadataPreviewItem[]
}

export type MetadataDeployResponse = {
  packageHash: string
  targetFingerprint: string
  applied: Array<{
    typeName: MetadataTypeName
    count: number
  }>
  skippedManualTypes: MetadataTypeName[]
}
