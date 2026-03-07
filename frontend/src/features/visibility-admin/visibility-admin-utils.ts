import type {
  VisibilityAssignment,
  VisibilityCone,
  VisibilityDecision,
  VisibilityRule,
  VisibilityRuleNode,
  VisibilityScalar,
} from './visibility-admin-types'

export const NEW_VISIBILITY_RECORD_SENTINEL = '__new__'

export type VisibilityConeDraft = {
  code: string
  name: string
  priority: number
  active: boolean
}

export type VisibilityRuleDraft = {
  coneId: string
  objectApiName: string
  effect: VisibilityDecision
  condition: VisibilityRuleNode
  fieldsAllowed: string[]
  fieldsDenied: string[]
  active: boolean
}

export type VisibilityAssignmentDraft = {
  coneId: string
  contactId: string
  permissionCode: string
  recordType: string
  validFrom: string
  validTo: string
}

export function buildVisibilityConesListPath(): string {
  return '/admin/visibility/cones'
}

export function buildVisibilityConeCreatePath(): string {
  return `/admin/visibility/cones/${NEW_VISIBILITY_RECORD_SENTINEL}`
}

export function buildVisibilityConeViewPath(coneId: string): string {
  return `/admin/visibility/cones/${encodeURIComponent(coneId)}`
}

export function buildVisibilityConeEditPath(coneId: string): string {
  return `/admin/visibility/cones/${encodeURIComponent(coneId)}/edit`
}

export function buildVisibilityRulesListPath(coneId?: string): string {
  return appendVisibilityConeFilter('/admin/visibility/rules', coneId)
}

export function buildVisibilityRuleCreatePath(coneId?: string): string {
  return appendVisibilityConeFilter(
    `/admin/visibility/rules/${NEW_VISIBILITY_RECORD_SENTINEL}`,
    coneId,
  )
}

export function buildVisibilityRuleViewPath(ruleId: string): string {
  return `/admin/visibility/rules/${encodeURIComponent(ruleId)}`
}

export function buildVisibilityRuleEditPath(ruleId: string): string {
  return `/admin/visibility/rules/${encodeURIComponent(ruleId)}/edit`
}

export function buildVisibilityAssignmentsListPath(coneId?: string): string {
  return appendVisibilityConeFilter('/admin/visibility/assignments', coneId)
}

export function buildVisibilityAssignmentCreatePath(coneId?: string): string {
  return appendVisibilityConeFilter(
    `/admin/visibility/assignments/${NEW_VISIBILITY_RECORD_SENTINEL}`,
    coneId,
  )
}

export function buildVisibilityAssignmentViewPath(assignmentId: string): string {
  return `/admin/visibility/assignments/${encodeURIComponent(assignmentId)}`
}

export function buildVisibilityAssignmentEditPath(assignmentId: string): string {
  return `/admin/visibility/assignments/${encodeURIComponent(assignmentId)}/edit`
}

export function formatVisibilityDateTime(value?: string): string {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString()
}

export function createEmptyVisibilityRuleNode(): VisibilityRuleNode {
  return {
    field: '',
    op: '=',
    value: '',
  }
}

export function createEmptyVisibilityConeDraft(): VisibilityConeDraft {
  return {
    code: '',
    name: '',
    priority: 0,
    active: true,
  }
}

export function createVisibilityConeDraft(cone: VisibilityCone): VisibilityConeDraft {
  return {
    code: cone.code,
    name: cone.name,
    priority: cone.priority,
    active: cone.active,
  }
}

export function parseVisibilityConeDraft(
  draft: VisibilityConeDraft,
): Omit<VisibilityCone, 'id'> {
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    priority: Number.isFinite(draft.priority) ? draft.priority : 0,
    active: draft.active,
  }
}

export function createEmptyVisibilityRuleDraft(defaultConeId = ''): VisibilityRuleDraft {
  return {
    coneId: defaultConeId,
    objectApiName: '',
    effect: 'ALLOW',
    condition: createEmptyVisibilityRuleNode(),
    fieldsAllowed: [],
    fieldsDenied: [],
    active: true,
  }
}

export function createVisibilityRuleDraft(rule: VisibilityRule): VisibilityRuleDraft {
  return {
    coneId: rule.coneId,
    objectApiName: rule.objectApiName,
    effect: rule.effect,
    condition: cloneVisibilityRuleNode(rule.condition),
    fieldsAllowed: [...(rule.fieldsAllowed ?? [])],
    fieldsDenied: [...(rule.fieldsDenied ?? [])],
    active: rule.active,
  }
}

export function parseVisibilityRuleDraft(
  draft: VisibilityRuleDraft,
): Omit<VisibilityRule, 'id'> {
  return {
    coneId: draft.coneId.trim(),
    objectApiName: draft.objectApiName.trim(),
    effect: draft.effect,
    condition: cloneVisibilityRuleNode(draft.condition),
    fieldsAllowed: normalizeFieldList(draft.fieldsAllowed),
    fieldsDenied: normalizeFieldList(draft.fieldsDenied),
    active: draft.active,
  }
}

export function createEmptyVisibilityAssignmentDraft(defaultConeId = ''): VisibilityAssignmentDraft {
  return {
    coneId: defaultConeId,
    contactId: '',
    permissionCode: '',
    recordType: '',
    validFrom: '',
    validTo: '',
  }
}

export function createVisibilityAssignmentDraft(
  assignment: VisibilityAssignment,
): VisibilityAssignmentDraft {
  return {
    coneId: assignment.coneId,
    contactId: assignment.contactId ?? '',
    permissionCode: assignment.permissionCode ?? '',
    recordType: assignment.recordType ?? '',
    validFrom: toDateTimeLocalValue(assignment.validFrom),
    validTo: toDateTimeLocalValue(assignment.validTo),
  }
}

export function parseVisibilityAssignmentDraft(
  draft: VisibilityAssignmentDraft,
): Omit<VisibilityAssignment, 'id'> {
  return {
    coneId: draft.coneId.trim(),
    contactId: normalizeOptionalText(draft.contactId),
    permissionCode: normalizeOptionalText(draft.permissionCode),
    recordType: normalizeOptionalText(draft.recordType),
    validFrom: fromDateTimeLocalValue(draft.validFrom),
    validTo: fromDateTimeLocalValue(draft.validTo),
  }
}

export function cloneVisibilityRuleNode(node: VisibilityRuleNode): VisibilityRuleNode {
  if ('all' in node) {
    return {
      all: node.all.map((entry) => cloneVisibilityRuleNode(entry)),
    }
  }

  if ('any' in node) {
    return {
      any: node.any.map((entry) => cloneVisibilityRuleNode(entry)),
    }
  }

  if ('not' in node) {
    return {
      not: cloneVisibilityRuleNode(node.not),
    }
  }

  return {
    field: node.field,
    op: node.op,
    value: Array.isArray(node.value) ? [...node.value] : node.value,
  }
}

export function createRuleNodeByKind(
  kind: 'predicate' | 'all' | 'any' | 'not',
): VisibilityRuleNode {
  if (kind === 'all') {
    return { all: [createEmptyVisibilityRuleNode()] }
  }

  if (kind === 'any') {
    return { any: [createEmptyVisibilityRuleNode()] }
  }

  if (kind === 'not') {
    return { not: createEmptyVisibilityRuleNode() }
  }

  return createEmptyVisibilityRuleNode()
}

export function describeVisibilityScalar(value: VisibilityScalar): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

function appendVisibilityConeFilter(path: string, coneId?: string): string {
  const normalizedConeId = coneId?.trim()
  if (!normalizedConeId) {
    return path
  }

  const searchParams = new URLSearchParams({
    coneId: normalizedConeId,
  })

  return `${path}?${searchParams.toString()}`
}

function normalizeFieldList(value: string[]): string[] | undefined {
  const items = [...new Set(value.map((entry) => entry.trim()).filter(Boolean))]
  return items.length > 0 ? items : undefined
}

function normalizeOptionalText(value: string): string | undefined {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function toDateTimeLocalValue(value?: string): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function fromDateTimeLocalValue(value: string): string | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  return new Date(normalized).toISOString()
}
