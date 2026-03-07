import { apiFetch } from '../../lib/api'

import type {
  VisibilityAssignment,
  VisibilityAssignmentDetailResponse,
  VisibilityAssignmentListResponse,
  VisibilityCone,
  VisibilityConeDetailResponse,
  VisibilityConeListResponse,
  VisibilityDebugContactSuggestionResponse,
  VisibilityDebugEvaluation,
  VisibilityDebugPreview,
  VisibilityDebugPreviewRequest,
  VisibilityDebugRequest,
  VisibilityRule,
  VisibilityRuleDetailResponse,
  VisibilityRuleListResponse,
} from './visibility-admin-types'

export async function fetchVisibilityCones(): Promise<VisibilityConeListResponse> {
  return apiFetch<VisibilityConeListResponse>('/visibility/admin/cones')
}

export async function fetchVisibilityCone(coneId: string): Promise<VisibilityConeDetailResponse> {
  return apiFetch<VisibilityConeDetailResponse>(`/visibility/admin/cones/${encodeURIComponent(coneId)}`)
}

export async function createVisibilityCone(
  cone: Omit<VisibilityCone, 'id'>,
): Promise<VisibilityConeDetailResponse> {
  return apiFetch<VisibilityConeDetailResponse>('/visibility/admin/cones', {
    method: 'POST',
    body: { cone },
  })
}

export async function updateVisibilityCone(
  coneId: string,
  cone: Omit<VisibilityCone, 'id'>,
): Promise<VisibilityConeDetailResponse> {
  return apiFetch<VisibilityConeDetailResponse>(
    `/visibility/admin/cones/${encodeURIComponent(coneId)}`,
    {
      method: 'PUT',
      body: { cone },
    },
  )
}

export async function deleteVisibilityCone(coneId: string): Promise<void> {
  await apiFetch<void>(`/visibility/admin/cones/${encodeURIComponent(coneId)}`, {
    method: 'DELETE',
  })
}

export async function fetchVisibilityRules(): Promise<VisibilityRuleListResponse> {
  return apiFetch<VisibilityRuleListResponse>('/visibility/admin/rules')
}

export async function fetchVisibilityRule(ruleId: string): Promise<VisibilityRuleDetailResponse> {
  return apiFetch<VisibilityRuleDetailResponse>(`/visibility/admin/rules/${encodeURIComponent(ruleId)}`)
}

export async function createVisibilityRule(
  rule: Omit<VisibilityRule, 'id'>,
): Promise<VisibilityRuleDetailResponse> {
  return apiFetch<VisibilityRuleDetailResponse>('/visibility/admin/rules', {
    method: 'POST',
    body: { rule },
  })
}

export async function updateVisibilityRule(
  ruleId: string,
  rule: Omit<VisibilityRule, 'id'>,
): Promise<VisibilityRuleDetailResponse> {
  return apiFetch<VisibilityRuleDetailResponse>(
    `/visibility/admin/rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'PUT',
      body: { rule },
    },
  )
}

export async function deleteVisibilityRule(ruleId: string): Promise<void> {
  await apiFetch<void>(`/visibility/admin/rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  })
}

export async function fetchVisibilityAssignments(): Promise<VisibilityAssignmentListResponse> {
  return apiFetch<VisibilityAssignmentListResponse>('/visibility/admin/assignments')
}

export async function fetchVisibilityAssignment(
  assignmentId: string,
): Promise<VisibilityAssignmentDetailResponse> {
  return apiFetch<VisibilityAssignmentDetailResponse>(
    `/visibility/admin/assignments/${encodeURIComponent(assignmentId)}`,
  )
}

export async function createVisibilityAssignment(
  assignment: Omit<VisibilityAssignment, 'id'>,
): Promise<VisibilityAssignmentDetailResponse> {
  return apiFetch<VisibilityAssignmentDetailResponse>('/visibility/admin/assignments', {
    method: 'POST',
    body: { assignment },
  })
}

export async function updateVisibilityAssignment(
  assignmentId: string,
  assignment: Omit<VisibilityAssignment, 'id'>,
): Promise<VisibilityAssignmentDetailResponse> {
  return apiFetch<VisibilityAssignmentDetailResponse>(
    `/visibility/admin/assignments/${encodeURIComponent(assignmentId)}`,
    {
      method: 'PUT',
      body: { assignment },
    },
  )
}

export async function deleteVisibilityAssignment(assignmentId: string): Promise<void> {
  await apiFetch<void>(`/visibility/admin/assignments/${encodeURIComponent(assignmentId)}`, {
    method: 'DELETE',
  })
}

export async function fetchVisibilityDebugContactSuggestions(
  query: string,
  limit = 8,
): Promise<VisibilityDebugContactSuggestionResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  })

  return apiFetch<VisibilityDebugContactSuggestionResponse>(
    `/visibility/admin/debug/contact-suggestions?${params.toString()}`,
  )
}

export async function evaluateVisibilityDebug(
  payload: VisibilityDebugRequest,
): Promise<VisibilityDebugEvaluation> {
  return apiFetch<VisibilityDebugEvaluation>('/visibility/admin/debug/evaluate', {
    method: 'POST',
    body: payload,
  })
}

export async function previewVisibilityDebug(
  payload: VisibilityDebugPreviewRequest,
): Promise<VisibilityDebugPreview> {
  return apiFetch<VisibilityDebugPreview>('/visibility/admin/debug/preview', {
    method: 'POST',
    body: payload,
  })
}
