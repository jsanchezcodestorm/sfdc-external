import { apiFetch } from '../../lib/api'

import type {
  ReportContactSuggestionResponse,
  ReportFieldSuggestionResponse,
  ReportFolderResponse,
  ReportObjectSuggestionResponse,
  ReportPermissionSuggestionResponse,
  ReportResponse,
  ReportsWorkspaceResponse,
  ReportRunResponse,
  ReportShareGrant,
  UpsertReportFolderPayload,
  UpsertReportPayload
} from './report-types'

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

export function fetchReportsWorkspace(appId: string): Promise<ReportsWorkspaceResponse> {
  return apiFetch<ReportsWorkspaceResponse>(`/reports/apps/${encodeURIComponent(appId)}/workspace`)
}

export function fetchReportFolder(appId: string, folderId: string): Promise<ReportFolderResponse> {
  return apiFetch<ReportFolderResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/folders/${encodeURIComponent(folderId)}`,
  )
}

export function createReportFolder(
  appId: string,
  payload: UpsertReportFolderPayload,
): Promise<ReportFolderResponse> {
  return apiFetch<ReportFolderResponse>(`/reports/apps/${encodeURIComponent(appId)}/folders`, {
    method: 'POST',
    body: payload,
  })
}

export function updateReportFolder(
  appId: string,
  folderId: string,
  payload: UpsertReportFolderPayload,
): Promise<ReportFolderResponse> {
  return apiFetch<ReportFolderResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/folders/${encodeURIComponent(folderId)}`,
    {
      method: 'PUT',
      body: payload,
    },
  )
}

export function updateReportFolderShares(
  appId: string,
  folderId: string,
  shares: ReportShareGrant[],
): Promise<ReportFolderResponse> {
  return apiFetch<ReportFolderResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/folders/${encodeURIComponent(folderId)}/shares`,
    {
      method: 'PUT',
      body: { shares },
    },
  )
}

export function deleteReportFolder(appId: string, folderId: string): Promise<void> {
  return apiFetch<void>(`/reports/apps/${encodeURIComponent(appId)}/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  })
}

export function fetchReport(appId: string, reportId: string): Promise<ReportResponse> {
  return apiFetch<ReportResponse>(`/reports/apps/${encodeURIComponent(appId)}/reports/${encodeURIComponent(reportId)}`)
}

export function createReport(appId: string, payload: UpsertReportPayload): Promise<ReportResponse> {
  return apiFetch<ReportResponse>(`/reports/apps/${encodeURIComponent(appId)}/reports`, {
    method: 'POST',
    body: payload,
  })
}

export function updateReport(
  appId: string,
  reportId: string,
  payload: UpsertReportPayload,
): Promise<ReportResponse> {
  return apiFetch<ReportResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/reports/${encodeURIComponent(reportId)}`,
    {
      method: 'PUT',
      body: payload,
    },
  )
}

export function updateReportShares(
  appId: string,
  reportId: string,
  shares: ReportShareGrant[],
): Promise<ReportResponse> {
  return apiFetch<ReportResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/reports/${encodeURIComponent(reportId)}/shares`,
    {
      method: 'PUT',
      body: { shares },
    },
  )
}

export function deleteReport(appId: string, reportId: string): Promise<void> {
  return apiFetch<void>(`/reports/apps/${encodeURIComponent(appId)}/reports/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  })
}

export function runReport(
  appId: string,
  reportId: string,
  cursor?: string | null,
): Promise<ReportRunResponse> {
  return apiFetch<ReportRunResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/reports/${encodeURIComponent(reportId)}/run${encodeQuery({
      cursor: cursor ?? undefined,
    })}`,
  )
}

export function searchReportContacts(
  appId: string,
  q: string,
  limit = 8,
): Promise<ReportContactSuggestionResponse> {
  return apiFetch<ReportContactSuggestionResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/suggestions/contacts${encodeQuery({ q, limit })}`,
  )
}

export function searchReportPermissions(
  appId: string,
  q: string,
  limit = 12,
): Promise<ReportPermissionSuggestionResponse> {
  return apiFetch<ReportPermissionSuggestionResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/suggestions/permissions${encodeQuery({ q, limit })}`,
  )
}

export function searchReportObjects(
  appId: string,
  q: string,
  limit = 20,
): Promise<ReportObjectSuggestionResponse> {
  return apiFetch<ReportObjectSuggestionResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/suggestions/objects${encodeQuery({ q, limit })}`,
  )
}

export function searchReportFields(
  appId: string,
  objectApiName: string,
  q = '',
  limit = 25,
): Promise<ReportFieldSuggestionResponse> {
  return apiFetch<ReportFieldSuggestionResponse>(
    `/reports/apps/${encodeURIComponent(appId)}/suggestions/fields${encodeQuery({
      objectApiName,
      q,
      limit,
    })}`,
  )
}
