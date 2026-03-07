import type { AclPermissionDefinition, AclResourceConfig } from './acl.types';

export interface AclAdminPermissionSummary {
  code: string;
  label?: string;
  description?: string;
  aliases: string[];
  isDefault: boolean;
  resourceCount: number;
  appCount: number;
}

export interface AclAdminPermissionListResponse {
  items: AclAdminPermissionSummary[];
}

export interface AclAdminPermissionResponse {
  permission: AclPermissionDefinition & { aliases: string[] };
  isDefault: boolean;
  resourceIds: string[];
  resourceCount: number;
  appIds: string[];
  appCount: number;
}

export interface AclAdminResourceSummary {
  id: string;
  type: AclResourceConfig['type'];
  target?: string;
  description?: string;
  permissionCount: number;
}

export interface AclAdminResourceListResponse {
  items: AclAdminResourceSummary[];
}

export interface AclAdminResourceResponse {
  resource: AclResourceConfig;
}

export interface AclAdminDefaultPermissionItem {
  permissionCode: string;
  label?: string;
  description?: string;
  enabled: boolean;
}

export interface AclAdminDefaultPermissionsResponse {
  items: AclAdminDefaultPermissionItem[];
}

export interface AclAdminContactPermissionSummary {
  contactId: string;
  permissionCodes: string[];
  permissionCount: number;
  updatedAt: string;
}

export interface AclAdminContactPermissionListResponse {
  items: AclAdminContactPermissionSummary[];
}

export interface AclAdminContactPermission {
  contactId: string;
  permissionCodes: string[];
  updatedAt?: string;
}

export interface AclAdminContactPermissionResponse {
  contactPermissions: AclAdminContactPermission;
}

export interface AclAdminContactSuggestion {
  id: string;
  name?: string;
  recordTypeDeveloperName?: string;
}

export interface AclAdminContactSuggestionResponse {
  items: AclAdminContactSuggestion[];
}
