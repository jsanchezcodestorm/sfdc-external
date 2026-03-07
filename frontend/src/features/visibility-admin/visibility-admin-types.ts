export type VisibilityDecision = 'ALLOW' | 'DENY'

export type VisibilityPredicateOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'IN'
  | 'NOT IN'
  | 'LIKE'
  | 'STARTS_WITH'
  | 'CONTAINS'
  | 'IS_NULL'
  | 'IS_NOT_NULL'

export type VisibilityScalar = string | number | boolean | null

export type VisibilityPredicateNode = {
  field: string
  op: VisibilityPredicateOperator
  value?: VisibilityScalar | VisibilityScalar[]
}

export type VisibilityAllNode = {
  all: VisibilityRuleNode[]
}

export type VisibilityAnyNode = {
  any: VisibilityRuleNode[]
}

export type VisibilityNotNode = {
  not: VisibilityRuleNode
}

export type VisibilityRuleNode =
  | VisibilityPredicateNode
  | VisibilityAllNode
  | VisibilityAnyNode
  | VisibilityNotNode

export type VisibilityCone = {
  id: string
  code: string
  name: string
  priority: number
  active: boolean
}

export type VisibilityConeSummary = VisibilityCone & {
  ruleCount: number
  assignmentCount: number
  updatedAt: string
}

export type VisibilityConeListResponse = {
  items: VisibilityConeSummary[]
}

export type VisibilityConeDetailResponse = {
  cone: VisibilityCone
  ruleCount: number
  assignmentCount: number
}

export type VisibilityRule = {
  id: string
  coneId: string
  objectApiName: string
  effect: VisibilityDecision
  condition: VisibilityRuleNode
  fieldsAllowed?: string[]
  fieldsDenied?: string[]
  active: boolean
}

export type VisibilityRuleSummary = {
  id: string
  coneId: string
  coneCode: string
  objectApiName: string
  effect: VisibilityDecision
  active: boolean
  fieldsAllowedCount: number
  fieldsDeniedCount: number
  updatedAt: string
}

export type VisibilityRuleListResponse = {
  items: VisibilityRuleSummary[]
}

export type VisibilityRuleDetailResponse = {
  rule: VisibilityRule
}

export type VisibilityAssignment = {
  id: string
  coneId: string
  contactId?: string
  permissionCode?: string
  recordType?: string
  validFrom?: string
  validTo?: string
}

export type VisibilityAssignmentSummary = {
  id: string
  coneId: string
  coneCode: string
  contactId?: string
  permissionCode?: string
  recordType?: string
  validFrom?: string
  validTo?: string
  isCurrentlyApplicable: boolean
  updatedAt: string
}

export type VisibilityAssignmentListResponse = {
  items: VisibilityAssignmentSummary[]
}

export type VisibilityAssignmentDetailResponse = {
  assignment: VisibilityAssignment
}

export type VisibilityDebugRequest = {
  objectApiName: string
  contactId: string
  permissions: string[]
  recordType?: string
  baseWhere?: string
  requestedFields?: string[]
}

export type VisibilityDebugEvaluation = {
  decision: VisibilityDecision
  reasonCode: string
  policyVersion: number
  objectApiName: string
  contactId: string
  recordType?: string
  appliedCones: string[]
  appliedRules: string[]
  matchedAssignments?: string[]
  permissionsHash?: string
  compiledAllowPredicate?: string
  compiledDenyPredicate?: string
  compiledPredicate?: string
  compiledFields?: string[]
  deniedFields?: string[]
  cacheKey?: string
  baseWhere?: string
  finalWhere?: string
  rowCount?: number
}

