import { ApiError, apiFetch } from '../../lib/api'
import type {
  EntityConfigEnvelope,
  EntityDetailResponse,
  EntityFormResponse,
  EntityListResponse,
  EntityRecord,
  EntityRelatedListResponse,
} from './entity-types'

type ListQueryOptions = {
  viewId?: string
  cursor?: string
  pageSize?: number
  search?: string
}

type RelatedQueryOptions = {
  cursor?: string
  pageSize?: number
}

export async function fetchEntityConfig(entityId: string): Promise<EntityConfigEnvelope> {
  return apiFetch<EntityConfigEnvelope>(`/entities/${encodeURIComponent(entityId)}/config`)
}

export async function fetchEntityList(
  entityId: string,
  options: ListQueryOptions = {},
): Promise<EntityListResponse> {
  const query = buildQueryString({
    viewId: options.viewId,
    cursor: options.cursor,
    pageSize: options.pageSize,
    search: options.search,
  })

  return apiFetch<EntityListResponse>(`/entities/${encodeURIComponent(entityId)}/list${query}`)
}

export async function fetchEntityRecord(
  entityId: string,
  recordId: string,
): Promise<EntityDetailResponse> {
  return apiFetch<EntityDetailResponse>(
    `/entities/${encodeURIComponent(entityId)}/records/${encodeURIComponent(recordId)}`,
  )
}

export async function fetchEntityForm(
  entityId: string,
  recordId?: string,
): Promise<EntityFormResponse> {
  const encodedEntityId = encodeURIComponent(entityId)

  if (recordId) {
    return apiFetch<EntityFormResponse>(
      `/entities/${encodedEntityId}/form/${encodeURIComponent(recordId)}`,
    )
  }

  return apiFetch<EntityFormResponse>(`/entities/${encodedEntityId}/form`)
}

export async function fetchEntityRelatedList(
  entityId: string,
  recordId: string,
  relatedListId: string,
  options: RelatedQueryOptions = {},
): Promise<EntityRelatedListResponse> {
  const query = buildQueryString({
    cursor: options.cursor,
    pageSize: options.pageSize,
    recordId,
  })

  return apiFetch<EntityRelatedListResponse>(
    `/entities/${encodeURIComponent(entityId)}/related/${encodeURIComponent(relatedListId)}${query}`,
  )
}

export function isInvalidEntityCursorError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    error.message.includes('Invalid or expired entity cursor')
  )
}

export async function createEntityRecord(
  entityId: string,
  values: EntityRecord,
): Promise<EntityRecord | null> {
  return apiFetch<EntityRecord | null>(`/entities/${encodeURIComponent(entityId)}/records`, {
    method: 'POST',
    body: values,
  })
}

export async function updateEntityRecord(
  entityId: string,
  recordId: string,
  values: EntityRecord,
): Promise<EntityRecord | null> {
  return apiFetch<EntityRecord | null>(
    `/entities/${encodeURIComponent(entityId)}/records/${encodeURIComponent(recordId)}`,
    {
      method: 'PUT',
      body: values,
    },
  )
}

export async function deleteEntityRecord(entityId: string, recordId: string): Promise<void> {
  await apiFetch<void>(
    `/entities/${encodeURIComponent(entityId)}/records/${encodeURIComponent(recordId)}`,
    {
      method: 'DELETE',
    },
  )
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string | number] => {
    const value = entry[1]
    return value !== undefined && value !== ''
  })

  if (entries.length === 0) {
    return ''
  }

  const searchParams = new URLSearchParams()

  for (const [key, value] of entries) {
    searchParams.set(key, String(value))
  }

  return `?${searchParams.toString()}`
}
