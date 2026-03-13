import type { ApplicationAuditStatus, Prisma, VisibilityDecision } from '../prisma/generated/client';

import type { VisibilityEvaluation } from '../visibility/visibility.types';

export interface RequestContextState {
  requestId: string;
  endpoint: string;
  httpMethod: string;
  ip: string;
  userAgent: string;
  userContactId?: string;
}

export interface SecurityAuditWriteInput {
  contactId?: string | null;
  endpoint?: string;
  httpMethod?: string;
  eventType: string;
  decision: VisibilityDecision;
  reasonCode: string;
  metadata?: unknown;
}

export interface VisibilityAuditWriteInput {
  evaluation: VisibilityEvaluation;
  queryKind: string;
  baseWhere?: string;
  finalWhere?: string;
  rowCount: number;
  durationMs?: number;
}

export interface ApplicationAuditIntentInput {
  contactId?: string;
  action: string;
  targetType: string;
  targetId: string;
  objectApiName?: string;
  recordId?: string;
  payload?: unknown;
  metadata?: unknown;
}

export interface ApplicationAuditOutcomeInput {
  auditId: bigint;
  status: ApplicationAuditStatus;
  result?: unknown;
  errorCode?: string;
}

export interface ApplicationAuditSuccessInput {
  contactId?: string;
  action: string;
  targetType: string;
  targetId: string;
  objectApiName?: string;
  recordId?: string;
  payload?: unknown;
  metadata?: unknown;
  result?: unknown;
  errorCode?: string;
  status?: Exclude<ApplicationAuditStatus, 'PENDING'>;
}

export interface QueryAuditIntentInput {
  contactId?: string;
  queryKind: string;
  targetId: string;
  objectApiName: string;
  recordId?: string;
  resolvedSoql: string;
  baseWhere?: string;
  finalWhere?: string;
  metadata?: unknown;
}

export interface QueryAuditOutcomeInput {
  auditId: bigint;
  status: ApplicationAuditStatus;
  rowCount: number;
  durationMs: number;
  result?: unknown;
  errorCode?: string;
}

export interface CursorPageResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SecurityAuditSummary {
  id: string;
  requestId: string;
  createdAt: string;
  contactId: string | null;
  endpoint: string;
  httpMethod: string;
  eventType: string;
  decision: VisibilityDecision;
  reasonCode: string;
}

export interface SecurityAuditDetail extends SecurityAuditSummary {
  ipHash: string;
  userAgentHash: string;
  metadata: Prisma.JsonValue | null;
}

export interface VisibilityAuditSummary {
  id: string;
  requestId: string;
  createdAt: string;
  contactId: string;
  objectApiName: string;
  queryKind: string;
  decision: VisibilityDecision;
  reasonCode: string;
  rowCount: number;
  policyVersion: string;
  objectPolicyVersion: string;
}

export interface VisibilityAuditDetail extends VisibilityAuditSummary {
  permissionsHash: string;
  recordType: string | null;
  baseWhereHash: string;
  finalWhereHash: string;
  appliedCones: Prisma.JsonValue;
  appliedRules: Prisma.JsonValue;
  durationMs: number;
}

export interface ApplicationAuditSummary {
  id: string;
  requestId: string;
  createdAt: string;
  completedAt: string | null;
  contactId: string;
  action: string;
  targetType: string;
  targetId: string;
  objectApiName: string | null;
  recordId: string | null;
  status: ApplicationAuditStatus;
  errorCode: string | null;
}

export interface ApplicationAuditDetail extends ApplicationAuditSummary {
  payloadHash: string;
  metadata: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
}

export interface QueryAuditSummary {
  id: string;
  requestId: string;
  createdAt: string;
  completedAt: string | null;
  contactId: string;
  queryKind: string;
  targetId: string;
  objectApiName: string;
  recordId: string | null;
  status: ApplicationAuditStatus;
  rowCount: number;
  durationMs: number;
  errorCode: string | null;
}

export interface QueryAuditDetail extends QueryAuditSummary {
  resolvedSoql: string;
  baseWhere: string;
  baseWhereHash: string;
  finalWhere: string;
  finalWhereHash: string;
  metadata: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
}
