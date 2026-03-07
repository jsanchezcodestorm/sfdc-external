export type AclResourceType = 'rest' | 'entity' | 'query' | 'route';

export interface PermissionDefinition {
  code: string;
  label?: string;
  description?: string;
  aliases?: string[];
}

export interface AclResourceDefinition {
  id: string;
  type: AclResourceType;
  target?: string;
  description?: string;
  permissions: string[];
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
  target?: string;
  description?: string;
  permissions: string[];
}

export interface AclConfigSnapshot {
  permissions: AclPermissionDefinition[];
  defaultPermissions: string[];
  resources: AclResourceConfig[];
}
