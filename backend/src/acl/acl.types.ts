export type AclResourceType = 'rest' | 'entity' | 'query' | 'route';
export type AclResourceAccessMode = 'disabled' | 'authenticated' | 'permission-bound';
export type AclResourceManagedBy = 'manual' | 'system';
export type AclResourceSyncState = 'present' | 'stale';

export interface PermissionDefinition {
  code: string;
  label?: string;
  description?: string;
  aliases?: string[];
}

export interface AclResourceDefinition {
  id: string;
  type: AclResourceType;
  accessMode: AclResourceAccessMode;
  managedBy: AclResourceManagedBy;
  syncState: AclResourceSyncState;
  sourceType?: AclResourceType;
  sourceRef?: string;
  target?: string;
  description?: string;
  permissions: string[];
}

export interface AclResourceStatus {
  id: string;
  accessMode: AclResourceAccessMode;
  managedBy: AclResourceManagedBy;
  syncState: AclResourceSyncState;
}

export interface PermissionCatalogFile {
  permissions: PermissionDefinition[];
}

export interface DefaultPermissionsFile {
  permissions: string[];
}

export interface AclPermissionDefinition {
  code: string;
  label?: string;
  description?: string;
  aliases?: string[];
}

export interface AclResourceConfig {
  id: string;
  type: AclResourceType;
  accessMode: AclResourceAccessMode;
  managedBy: AclResourceManagedBy;
  syncState: AclResourceSyncState;
  sourceType?: AclResourceType;
  sourceRef?: string;
  target?: string;
  description?: string;
  permissions: string[];
}

export interface AclConfigSnapshot {
  permissions: AclPermissionDefinition[];
  defaultPermissions: string[];
  resources: AclResourceConfig[];
}
