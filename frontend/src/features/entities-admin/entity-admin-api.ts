import { apiFetch } from '../../lib/api'
import type {
  EntityAdminBootstrapPreviewResponse,
  EntityAdminConfigListResponse,
  EntityAdminConfigResponse,
  SalesforceObjectApiNameSuggestionResponse,
  SalesforceObjectFieldSuggestionResponse,
} from './entity-admin-types'
import type { EntityConfig } from '../entities/entity-types'

export async function fetchEntityAdminConfigList(): Promise<EntityAdminConfigListResponse> {
  return apiFetch<EntityAdminConfigListResponse>('/entities/admin/configs')
}

export async function fetchEntityAdminConfig(
  entityId: string,
): Promise<EntityAdminConfigResponse> {
  return apiFetch<EntityAdminConfigResponse>(
    `/entities/admin/configs/${encodeURIComponent(entityId)}`,
  )
}

export async function createEntityAdminConfig(
  entity: EntityConfig,
): Promise<EntityAdminConfigResponse> {
  return apiFetch<EntityAdminConfigResponse>('/entities/admin/configs', {
    method: 'POST',
    body: { entity },
  })
}

export async function previewEntityAdminBootstrap(
  entity: EntityConfig,
): Promise<EntityAdminBootstrapPreviewResponse> {
  return apiFetch<EntityAdminBootstrapPreviewResponse>(
    '/entities/admin/configs/bootstrap-preview',
    {
      method: 'POST',
      body: { entity },
    },
  )
}

export async function updateEntityAdminConfig(
  entityId: string,
  entity: EntityConfig,
): Promise<EntityAdminConfigResponse> {
  return apiFetch<EntityAdminConfigResponse>(
    `/entities/admin/configs/${encodeURIComponent(entityId)}`,
    {
      method: 'PUT',
      body: { entity },
    },
  )
}

export async function deleteEntityAdminConfig(entityId: string): Promise<void> {
  await apiFetch<void>(`/entities/admin/configs/${encodeURIComponent(entityId)}`, {
    method: 'DELETE',
  })
}

export async function searchEntityAdminObjectApiNames(
  query: string,
  limit = 8,
): Promise<SalesforceObjectApiNameSuggestionResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  })

  return apiFetch<SalesforceObjectApiNameSuggestionResponse>(
    `/entities/admin/configs/object-api-name/suggestions?${params.toString()}`,
  )
}

export async function searchEntityAdminObjectFields(
  objectApiName: string,
  query: string,
  limit = 20,
): Promise<SalesforceObjectFieldSuggestionResponse> {
  const params = new URLSearchParams({
    objectApiName,
    q: query,
    limit: String(limit),
  })

  return apiFetch<SalesforceObjectFieldSuggestionResponse>(
    `/entities/admin/configs/object-fields/suggestions?${params.toString()}`,
  )
}
