import { apiFetch } from '../../lib/api'
import type {
  EntityAdminConfigListResponse,
  EntityAdminConfigResponse,
  SalesforceObjectApiNameSuggestionResponse,
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

export async function upsertEntityAdminConfig(
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
