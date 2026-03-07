import { apiFetch } from '../../lib/api'

import type {
  QueryTemplate,
  QueryTemplateAdminListResponse,
  QueryTemplateAdminResponse,
} from './query-template-admin-types'

export async function fetchQueryTemplateAdminList(): Promise<QueryTemplateAdminListResponse> {
  return apiFetch<QueryTemplateAdminListResponse>('/query/admin/templates')
}

export async function fetchQueryTemplateAdmin(
  templateId: string,
): Promise<QueryTemplateAdminResponse> {
  return apiFetch<QueryTemplateAdminResponse>(
    `/query/admin/templates/${encodeURIComponent(templateId)}`,
  )
}

export async function upsertQueryTemplateAdmin(
  templateId: string,
  template: QueryTemplate,
): Promise<QueryTemplateAdminResponse> {
  return apiFetch<QueryTemplateAdminResponse>(
    `/query/admin/templates/${encodeURIComponent(templateId)}`,
    {
      method: 'PUT',
      body: template,
    },
  )
}

export async function deleteQueryTemplateAdmin(templateId: string): Promise<void> {
  await apiFetch<void>(`/query/admin/templates/${encodeURIComponent(templateId)}`, {
    method: 'DELETE',
  })
}
