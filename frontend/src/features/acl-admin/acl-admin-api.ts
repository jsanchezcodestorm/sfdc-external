import { apiFetch } from '../../lib/api'

import type {
  AclAdminContactPermissionListResponse,
  AclAdminContactPermissionResponse,
  AclAdminContactSuggestionResponse,
  AclAdminDefaultPermissionsResponse,
  AclAdminPermissionListResponse,
  AclAdminPermissionResponse,
  AclAdminResourceListResponse,
  AclAdminResourceResponse,
  AclPermissionDefinition,
  AclResourceConfig,
} from './acl-admin-types'

export async function fetchAclPermissions(): Promise<AclAdminPermissionListResponse> {
  return apiFetch<AclAdminPermissionListResponse>('/acl/admin/permissions')
}

export async function fetchAclPermission(permissionCode: string): Promise<AclAdminPermissionResponse> {
  return apiFetch<AclAdminPermissionResponse>(
    `/acl/admin/permissions/${encodeURIComponent(permissionCode)}`,
  )
}

export async function createAclPermission(
  permission: AclPermissionDefinition,
): Promise<AclAdminPermissionResponse> {
  return apiFetch<AclAdminPermissionResponse>('/acl/admin/permissions', {
    method: 'POST',
    body: { permission },
  })
}

export async function updateAclPermission(
  permissionCode: string,
  permission: AclPermissionDefinition,
): Promise<AclAdminPermissionResponse> {
  return apiFetch<AclAdminPermissionResponse>(
    `/acl/admin/permissions/${encodeURIComponent(permissionCode)}`,
    {
      method: 'PUT',
      body: { permission },
    },
  )
}

export async function deleteAclPermission(permissionCode: string): Promise<void> {
  await apiFetch<void>(`/acl/admin/permissions/${encodeURIComponent(permissionCode)}`, {
    method: 'DELETE',
  })
}

export async function fetchAclResources(): Promise<AclAdminResourceListResponse> {
  return apiFetch<AclAdminResourceListResponse>('/acl/admin/resources')
}

export async function fetchAclResource(resourceId: string): Promise<AclAdminResourceResponse> {
  return apiFetch<AclAdminResourceResponse>(
    `/acl/admin/resources/${encodeURIComponent(resourceId)}`,
  )
}

export async function createAclResource(
  resource: AclResourceConfig,
): Promise<AclAdminResourceResponse> {
  return apiFetch<AclAdminResourceResponse>('/acl/admin/resources', {
    method: 'POST',
    body: { resource },
  })
}

export async function updateAclResource(
  resourceId: string,
  resource: AclResourceConfig,
): Promise<AclAdminResourceResponse> {
  return apiFetch<AclAdminResourceResponse>(
    `/acl/admin/resources/${encodeURIComponent(resourceId)}`,
    {
      method: 'PUT',
      body: { resource },
    },
  )
}

export async function deleteAclResource(resourceId: string): Promise<void> {
  await apiFetch<void>(`/acl/admin/resources/${encodeURIComponent(resourceId)}`, {
    method: 'DELETE',
  })
}

export async function fetchAclDefaultPermissions(): Promise<AclAdminDefaultPermissionsResponse> {
  return apiFetch<AclAdminDefaultPermissionsResponse>('/acl/admin/default-permissions')
}

export async function updateAclDefaultPermissions(
  permissionCodes: string[],
): Promise<AclAdminDefaultPermissionsResponse> {
  return apiFetch<AclAdminDefaultPermissionsResponse>('/acl/admin/default-permissions', {
    method: 'PUT',
    body: { permissionCodes },
  })
}

export async function fetchAclContactPermissions(): Promise<AclAdminContactPermissionListResponse> {
  return apiFetch<AclAdminContactPermissionListResponse>('/acl/admin/contact-permissions')
}

export async function fetchAclContactPermission(
  contactId: string,
): Promise<AclAdminContactPermissionResponse> {
  return apiFetch<AclAdminContactPermissionResponse>(
    `/acl/admin/contact-permissions/${encodeURIComponent(contactId)}`,
  )
}

export async function updateAclContactPermission(
  contactId: string,
  permissionCodes: string[],
): Promise<AclAdminContactPermissionResponse> {
  return apiFetch<AclAdminContactPermissionResponse>(
    `/acl/admin/contact-permissions/${encodeURIComponent(contactId)}`,
    {
      method: 'PUT',
      body: { permissionCodes },
    },
  )
}

export async function deleteAclContactPermission(contactId: string): Promise<void> {
  await apiFetch<void>(`/acl/admin/contact-permissions/${encodeURIComponent(contactId)}`, {
    method: 'DELETE',
  })
}

export async function fetchAclContactSuggestions(
  query: string,
  limit = 8,
): Promise<AclAdminContactSuggestionResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  })

  return apiFetch<AclAdminContactSuggestionResponse>(
    `/acl/admin/contact-suggestions?${params.toString()}`,
  )
}
