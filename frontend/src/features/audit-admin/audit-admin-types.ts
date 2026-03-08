export type AuditStream = 'security' | 'visibility' | 'application' | 'query'

export type AuditCursorPage<T> = {
  items: T[]
  nextCursor: string | null
}

export type SecurityAuditSummary = {
  id: string
  requestId: string
  createdAt: string
  contactId: string | null
  endpoint: string
  httpMethod: string
  eventType: string
  decision: 'ALLOW' | 'DENY'
  reasonCode: string
}

export type SecurityAuditDetail = SecurityAuditSummary & {
  ipHash: string
  userAgentHash: string
  metadata: unknown
}

export type VisibilityAuditSummary = {
  id: string
  requestId: string
  createdAt: string
  contactId: string
  objectApiName: string
  queryKind: string
  decision: 'ALLOW' | 'DENY'
  reasonCode: string
  rowCount: number
  policyVersion: string
  objectPolicyVersion: string
}

export type VisibilityAuditDetail = VisibilityAuditSummary & {
  permissionsHash: string
  recordType: string | null
  baseWhereHash: string
  finalWhereHash: string
  appliedCones: unknown
  appliedRules: unknown
  durationMs: number
}

export type ApplicationAuditSummary = {
  id: string
  requestId: string
  createdAt: string
  completedAt: string | null
  contactId: string
  action: string
  targetType: string
  targetId: string
  objectApiName: string | null
  recordId: string | null
  status: 'PENDING' | 'SUCCESS' | 'FAILURE'
  errorCode: string | null
}

export type ApplicationAuditDetail = ApplicationAuditSummary & {
  payloadHash: string
  metadata: unknown
  result: unknown
}

export type QueryAuditSummary = {
  id: string
  requestId: string
  createdAt: string
  completedAt: string | null
  contactId: string
  queryKind: string
  targetId: string
  objectApiName: string
  recordId: string | null
  status: 'PENDING' | 'SUCCESS' | 'FAILURE'
  rowCount: number
  durationMs: number
  errorCode: string | null
}

export type QueryAuditDetail = QueryAuditSummary & {
  resolvedSoql: string
  baseWhere: string
  baseWhereHash: string
  finalWhere: string
  finalWhereHash: string
  metadata: unknown
  result: unknown
}

export type SecurityAuditQuery = {
  from?: string
  to?: string
  contactId?: string
  requestId?: string
  cursor?: string
  limit?: number
  eventType?: string
  decision?: 'ALLOW' | 'DENY' | ''
  reasonCode?: string
  endpoint?: string
}

export type VisibilityAuditQuery = {
  from?: string
  to?: string
  contactId?: string
  requestId?: string
  cursor?: string
  limit?: number
  objectApiName?: string
  queryKind?: string
  decision?: 'ALLOW' | 'DENY' | ''
  reasonCode?: string
}

export type ApplicationAuditQuery = {
  from?: string
  to?: string
  contactId?: string
  requestId?: string
  cursor?: string
  limit?: number
  action?: string
  status?: 'PENDING' | 'SUCCESS' | 'FAILURE' | ''
  targetType?: string
  objectApiName?: string
}

export type QueryAuditQuery = {
  from?: string
  to?: string
  contactId?: string
  requestId?: string
  cursor?: string
  limit?: number
  queryKind?: string
  status?: 'PENDING' | 'SUCCESS' | 'FAILURE' | ''
  targetId?: string
  objectApiName?: string
  recordId?: string
}
