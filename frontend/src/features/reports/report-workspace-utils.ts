import type { ReportRouteSelection } from './report-workspace-model'

export function parseReportRoute(value: string): ReportRouteSelection {
  const normalized = value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalized) {
    return { kind: 'workspace' }
  }

  const parts = normalized.split('/')
  if (parts[0] === 'folders' && parts[1]) {
    return { kind: 'folder', folderId: decodeURIComponent(parts[1]) }
  }

  if (parts[0] === 'reports' && parts[1]) {
    return { kind: 'report', reportId: decodeURIComponent(parts[1]) }
  }

  return { kind: 'invalid' }
}

export function buildReportItemBasePath(appId: string, itemId: string): string {
  return `/app/${encodeURIComponent(appId)}/items/${encodeURIComponent(itemId)}`
}

export function buildReportFolderPath(basePath: string, folderId: string): string {
  return `${basePath}/folders/${encodeURIComponent(folderId)}`
}

export function buildReportPath(basePath: string, reportId: string): string {
  return `${basePath}/reports/${encodeURIComponent(reportId)}`
}

export function formatDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
  }).format(parsed)
}

export function formatRunValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => formatRunValue(entry)).join(', ')
  }

  return JSON.stringify(value)
}
