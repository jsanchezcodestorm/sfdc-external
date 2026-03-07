import { apiFetch } from '../../lib/api'

import type { AppAdminListResponse, AppAdminResponse, AppConfig } from './apps-admin-types'

export async function fetchAppAdminList(): Promise<AppAdminListResponse> {
  return apiFetch<AppAdminListResponse>('/apps/admin')
}

export async function fetchAppAdmin(appId: string): Promise<AppAdminResponse> {
  return apiFetch<AppAdminResponse>(`/apps/admin/${encodeURIComponent(appId)}`)
}

export async function createAppAdmin(app: AppConfig): Promise<AppAdminResponse> {
  return apiFetch<AppAdminResponse>('/apps/admin', {
    method: 'POST',
    body: { app },
  })
}

export async function updateAppAdmin(appId: string, app: AppConfig): Promise<AppAdminResponse> {
  return apiFetch<AppAdminResponse>(`/apps/admin/${encodeURIComponent(appId)}`, {
    method: 'PUT',
    body: { app },
  })
}

export async function deleteAppAdmin(appId: string): Promise<void> {
  await apiFetch<void>(`/apps/admin/${encodeURIComponent(appId)}`, {
    method: 'DELETE',
  })
}
