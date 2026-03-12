export const METADATA_PACKAGE_FORMAT = 'sfdc-external-admin-package';
export const METADATA_PACKAGE_VERSION = 1;
export const METADATA_CONTACT_MAPPING = 'email';
export const METADATA_SECRET_POLICY = 'none';
export const METADATA_DEPLOY_MODE = 'upsert';

export type MetadataSectionName =
  | 'entities'
  | 'apps'
  | 'acl'
  | 'aclContactPermissions'
  | 'queryTemplates'
  | 'visibility'
  | 'authProviders'
  | 'localCredentials';

export type DeployableMetadataTypeName =
  | 'EntityConfig'
  | 'AppConfig'
  | 'AclPermission'
  | 'AclResource'
  | 'AclDefaultPermission'
  | 'AclContactPermission'
  | 'QueryTemplate'
  | 'VisibilityCone'
  | 'VisibilityRule'
  | 'VisibilityAssignment';

export type ManualMetadataTypeName = 'AuthProvider' | 'LocalCredential';

export type MetadataTypeName = DeployableMetadataTypeName | ManualMetadataTypeName;

export interface MetadataContactReference {
  email: string;
  sourceId?: string;
}

export interface MetadataTypeMembersDescriptor {
  name: MetadataTypeName;
  members: string[];
}

export interface MetadataPackageDescriptor {
  version: number;
  format: string;
  contactMapping: 'email';
  secretPolicy: 'none';
  deployMode: 'upsert';
  types: Array<{
    name: DeployableMetadataTypeName;
    members: string[];
  }>;
  manualTypes: Array<{
    name: ManualMetadataTypeName;
    members: string[];
  }>;
}

export type MetadataPreviewChange = 'create' | 'update' | 'unchanged';

export interface MetadataPreviewItem {
  typeName: MetadataTypeName;
  member: string;
  path: string;
  category: 'deployable' | 'manual';
  change: MetadataPreviewChange;
  warnings: string[];
  blockers: string[];
}

export interface MetadataPreviewResponse {
  package: MetadataPackageDescriptor;
  packageHash: string;
  targetFingerprint: string;
  hasBlockers: boolean;
  hasDeployableEntries: boolean;
  warnings: string[];
  blockers: string[];
  manualActions: string[];
  items: MetadataPreviewItem[];
}

export interface MetadataDeployResponse {
  packageHash: string;
  targetFingerprint: string;
  applied: Array<{
    typeName: DeployableMetadataTypeName;
    count: number;
  }>;
  skippedManualTypes: ManualMetadataTypeName[];
}
