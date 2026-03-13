import type { ReportShareGrant } from '../reports/report-types'

import { apiFetch } from '../../lib/api'

import type {
  DashboardContactSuggestionResponse,
  DashboardFieldSuggestionResponse,
  DashboardFolderResponse,
  DashboardPermissionSuggestionResponse,
  DashboardResponse,
  DashboardsWorkspaceResponse,
  DashboardRunRequest,
  DashboardRunResponse,
  DashboardSourceReportSuggestionResponse,
  UpsertDashboardFolderPayload,
  UpsertDashboardPayload,
} from './dashboard-types'

function encodeQuery(params: Record<string, string | number | undefined | null>): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    searchParams.set(key, String(value))
  }

  const query = searchParams.toString()
  return query.length > 0 ? `?${query}` : ''
}

export function fetchDashboardsWorkspace(appId: string): Promise<DashboardsWorkspaceResponse> {
  return apiFetch<DashboardsWorkspaceResponse>(`/dashboards/apps/${encodeURIComponent(appId)}/workspace`)
}

export function fetchDashboardFolder(appId: string, folderId: string): Promise<DashboardFolderResponse> {
  return apiFetch<DashboardFolderResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/folders/${encodeURIComponent(folderId)}`,
  )
}

export function createDashboardFolder(
  appId: string,
  payload: UpsertDashboardFolderPayload,
): Promise<DashboardFolderResponse> {
  return apiFetch<DashboardFolderResponse>(`/dashboards/apps/${encodeURIComponent(appId)}/folders`, {
    method: 'POST',
    body: payload,
  })
}

export function updateDashboardFolder(
  appId: string,
  folderId: string,
  payload: UpsertDashboardFolderPayload,
): Promise<DashboardFolderResponse> {
  return apiFetch<DashboardFolderResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/folders/${encodeURIComponent(folderId)}`,
    {
      method: 'PUT',
      body: payload,
    },
  )
}

export function updateDashboardFolderShares(
  appId: string,
  folderId: string,
  shares: ReportShareGrant[],
): Promise<DashboardFolderResponse> {
  return apiFetch<DashboardFolderResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/folders/${encodeURIComponent(folderId)}/shares`,
    {
      method: 'PUT',
      body: { shares },
    },
  )
}

export function deleteDashboardFolder(appId: string, folderId: string): Promise<void> {
  return apiFetch<void>(`/dashboards/apps/${encodeURIComponent(appId)}/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  })
}

export function fetchDashboard(appId: string, dashboardId: string): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/dashboards/${encodeURIComponent(dashboardId)}`,
  )
}

export function createDashboard(appId: string, payload: UpsertDashboardPayload): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>(`/dashboards/apps/${encodeURIComponent(appId)}/dashboards`, {
    method: 'POST',
    body: payload,
  })
}

export function updateDashboard(
  appId: string,
  dashboardId: string,
  payload: UpsertDashboardPayload,
): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/dashboards/${encodeURIComponent(dashboardId)}`,
    {
      method: 'PUT',
      body: payload,
    },
  )
}

export function updateDashboardShares(
  appId: string,
  dashboardId: string,
  shares: ReportShareGrant[],
): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/dashboards/${encodeURIComponent(dashboardId)}/shares`,
    {
      method: 'PUT',
      body: { shares },
    },
  )
}

export function deleteDashboard(appId: string, dashboardId: string): Promise<void> {
  return apiFetch<void>(
    `/dashboards/apps/${encodeURIComponent(appId)}/dashboards/${encodeURIComponent(dashboardId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function runDashboard(
  appId: string,
  dashboardId: string,
  payload: DashboardRunRequest,
): Promise<DashboardRunResponse> {
  return apiFetch<DashboardRunResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/dashboards/${encodeURIComponent(dashboardId)}/run`,
    {
      method: 'POST',
      body: payload,
    },
  )
}

export function searchDashboardContacts(
  appId: string,
  q: string,
  limit = 8,
): Promise<DashboardContactSuggestionResponse> {
  return apiFetch<DashboardContactSuggestionResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/suggestions/contacts${encodeQuery({ q, limit })}`,
  )
}

export function searchDashboardPermissions(
  appId: string,
  q: string,
  limit = 12,
): Promise<DashboardPermissionSuggestionResponse> {
  return apiFetch<DashboardPermissionSuggestionResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/suggestions/permissions${encodeQuery({ q, limit })}`,
  )
}

export function searchDashboardSourceReports(
  appId: string,
  q: string,
  limit = 20,
): Promise<DashboardSourceReportSuggestionResponse> {
  return apiFetch<DashboardSourceReportSuggestionResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/suggestions/reports${encodeQuery({ q, limit })}`,
  )
}

export function searchDashboardFields(
  appId: string,
  reportId: string,
  q = '',
  limit = 25,
): Promise<DashboardFieldSuggestionResponse> {
  return apiFetch<DashboardFieldSuggestionResponse>(
    `/dashboards/apps/${encodeURIComponent(appId)}/suggestions/fields${encodeQuery({
      reportId,
      q,
      limit,
    })}`,
  )
}
