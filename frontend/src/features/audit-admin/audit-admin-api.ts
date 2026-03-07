import { apiFetch } from '../../lib/api'

import type {
  ApplicationAuditDetail,
  ApplicationAuditQuery,
  ApplicationAuditSummary,
  AuditCursorPage,
  QueryAuditDetail,
  QueryAuditQuery,
  QueryAuditSummary,
  SecurityAuditDetail,
  SecurityAuditQuery,
  SecurityAuditSummary,
  VisibilityAuditDetail,
  VisibilityAuditQuery,
  VisibilityAuditSummary,
} from './audit-admin-types'

function serializeDate(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }

  return parsed.toISOString()
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue
    }

    searchParams.set(key, String(value))
  }

  const query = searchParams.toString()
  return query.length > 0 ? `?${query}` : ''
}

export function fetchSecurityAuditList(
  query: SecurityAuditQuery,
): Promise<AuditCursorPage<SecurityAuditSummary>> {
  return apiFetch<AuditCursorPage<SecurityAuditSummary>>(
    `/audit/security${buildQueryString({
      ...query,
      from: serializeDate(query.from),
      to: serializeDate(query.to),
    })}`,
  )
}

export function fetchSecurityAuditDetail(id: string): Promise<SecurityAuditDetail> {
  return apiFetch<SecurityAuditDetail>(`/audit/security/${encodeURIComponent(id)}`)
}

export function fetchVisibilityAuditList(
  query: VisibilityAuditQuery,
): Promise<AuditCursorPage<VisibilityAuditSummary>> {
  return apiFetch<AuditCursorPage<VisibilityAuditSummary>>(
    `/audit/visibility${buildQueryString({
      ...query,
      from: serializeDate(query.from),
      to: serializeDate(query.to),
    })}`,
  )
}

export function fetchVisibilityAuditDetail(id: string): Promise<VisibilityAuditDetail> {
  return apiFetch<VisibilityAuditDetail>(`/audit/visibility/${encodeURIComponent(id)}`)
}

export function fetchApplicationAuditList(
  query: ApplicationAuditQuery,
): Promise<AuditCursorPage<ApplicationAuditSummary>> {
  return apiFetch<AuditCursorPage<ApplicationAuditSummary>>(
    `/audit/application${buildQueryString({
      ...query,
      from: serializeDate(query.from),
      to: serializeDate(query.to),
    })}`,
  )
}

export function fetchApplicationAuditDetail(id: string): Promise<ApplicationAuditDetail> {
  return apiFetch<ApplicationAuditDetail>(`/audit/application/${encodeURIComponent(id)}`)
}

export function fetchQueryAuditList(
  query: QueryAuditQuery,
): Promise<AuditCursorPage<QueryAuditSummary>> {
  return apiFetch<AuditCursorPage<QueryAuditSummary>>(
    `/audit/query${buildQueryString({
      ...query,
      from: serializeDate(query.from),
      to: serializeDate(query.to),
    })}`,
  )
}

export function fetchQueryAuditDetail(id: string): Promise<QueryAuditDetail> {
  return apiFetch<QueryAuditDetail>(`/audit/query/${encodeURIComponent(id)}`)
}
