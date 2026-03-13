import type { AclResourceSyncResult } from './acl-resource-sync.service';
import type { AclPermissionDefinition, AclResourceConfig, AclResourceStatus } from './acl.types';

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
  resources: AclAdminResourceSummary[];
  resourceCount: number;
  appIds: string[];
  appCount: number;
}

export interface AclAdminResourceSummary {
  id: string;
  type: AclResourceConfig['type'];
  accessMode: AclResourceConfig['accessMode'];
  managedBy: AclResourceConfig['managedBy'];
  syncState: AclResourceConfig['syncState'];
  sourceType?: AclResourceConfig['sourceType'];
  sourceRef?: AclResourceConfig['sourceRef'];
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

export interface AclAdminResourceSyncResponse {
  result: AclResourceSyncResult;
}

export interface AclDerivedResourceStatus extends AclResourceStatus {}

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
