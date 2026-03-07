import type {
  ApplicationAuditQuery,
  AuditStream,
  QueryAuditQuery,
  SecurityAuditQuery,
  VisibilityAuditQuery,
} from './audit-admin-types'

type SearchableAuditFilters =
  | SecurityAuditQuery
  | VisibilityAuditQuery
  | ApplicationAuditQuery
  | QueryAuditQuery

const COMMON_FILTER_KEYS = ['from', 'to', 'contactId', 'requestId'] as const

const STREAM_FILTER_KEYS: Record<AuditStream, readonly string[]> = {
  security: ['eventType', 'decision', 'reasonCode', 'endpoint'],
  visibility: ['objectApiName', 'queryKind', 'decision', 'reasonCode'],
  application: ['action', 'status', 'targetType', 'objectApiName'],
  query: ['queryKind', 'status', 'targetId', 'objectApiName', 'recordId'],
}

export const DEFAULT_AUDIT_LIMIT = 25

export const AUDIT_STREAMS: AuditStream[] = ['security', 'visibility', 'application', 'query']

export const AUDIT_TAB_COPY: Record<AuditStream, { title: string; description: string }> = {
  security: {
    title: 'Security',
    description: 'Auth, sessione, ACL, input validation e raw query.',
  },
  visibility: {
    title: 'Visibility',
    description: 'Decisioni finali di visibilita con row count e reason code.',
  },
  application: {
    title: 'Application',
    description: 'CRUD applicativi, configurazioni admin e mutazioni verso Salesforce.',
  },
  query: {
    title: 'Query',
    description: 'Query SOQL runtime risolte, complete di testo finale e outcome esecuzione.',
  },
}

export function isAuditStream(value: string | null | undefined): value is AuditStream {
  return value === 'security' || value === 'visibility' || value === 'application' || value === 'query'
}

export function parseAuditTab(value: string | null | undefined): AuditStream {
  return isAuditStream(value) ? value : 'security'
}

export function buildAuditListPath(): string {
  return '/admin/audit'
}

export function buildAuditViewPath(stream: AuditStream, auditId: string): string {
  return `/admin/audit/${stream}/${encodeURIComponent(auditId)}`
}

export function buildAuditSearch(
  stream: AuditStream,
  filters: SearchableAuditFilters = { limit: DEFAULT_AUDIT_LIMIT },
): string {
  const params = new URLSearchParams()
  const values = filters as Record<string, string | number | undefined>

  params.set('tab', stream)

  for (const key of [...COMMON_FILTER_KEYS, ...STREAM_FILTER_KEYS[stream]]) {
    const value = values[key]
    if (typeof value !== 'string') {
      continue
    }

    const normalized = value.trim()
    if (normalized.length === 0) {
      continue
    }

    params.set(key, normalized)
  }

  return `?${params.toString()}`
}

export function parseAuditFilters(
  stream: AuditStream,
  searchParams: URLSearchParams,
): SearchableAuditFilters {
  const values: Record<string, string | number | undefined> = {
    limit: DEFAULT_AUDIT_LIMIT,
  }

  for (const key of [...COMMON_FILTER_KEYS, ...STREAM_FILTER_KEYS[stream]]) {
    const normalized = searchParams.get(key)?.trim()
    if (!normalized) {
      continue
    }

    values[key] = normalized
  }

  return values as SearchableAuditFilters
}
