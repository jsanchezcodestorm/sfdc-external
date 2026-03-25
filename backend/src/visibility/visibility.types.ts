import type { SessionUser } from '../auth/session-user.interface';

import type { VisibilityRuleNode } from './visibility-rule-dsl';

export type VisibilityDecision = 'ALLOW' | 'DENY';

export interface VisibilityEvaluation {
  decision: VisibilityDecision;
  reasonCode: string;
  policyVersion: number;
  objectPolicyVersion: number;
  objectApiName: string;
  subjectId?: string;
  subjectTraits?: Record<string, unknown>;
  contactId: string;
  recordType?: string;
  appliedCones: string[];
  appliedRules: string[];
  matchedAssignments?: string[];
  permissionsHash?: string;
  compiledAllowPredicate?: string;
  compiledDenyPredicate?: string;
  compiledPredicate?: string;
  compiledFields?: string[];
  deniedFields?: string[];
  cacheKey?: string;
  baseWhere?: string;
  finalWhere?: string;
  rowCount?: number;
}

export interface VisibilityContext {
  user?: SessionUser;
  objectApiName: string;
  subjectId?: string;
  alternateSubjectIds?: string[];
  subjectTraits?: Record<string, unknown>;
  contactId?: string;
  permissions?: string[];
  contactRecordTypeDeveloperName?: string;
  baseWhere?: string;
  requestedFields?: string[];
  queryKind?: string;
  skipCache?: boolean;
}

export interface VisibilityConeDefinition {
  id: string;
  code: string;
  name: string;
  priority: number;
  active: boolean;
}

export interface VisibilityRuleDefinition {
  id: string;
  coneId: string;
  objectApiName: string;
  description?: string;
  effect: VisibilityDecision;
  condition: VisibilityRuleNode;
  fieldsAllowed?: string[];
  fieldsDenied?: string[];
  active: boolean;
}

export interface VisibilityAssignmentDefinition {
  id: string;
  coneId: string;
  subjectId?: string;
  subjectTraitKey?: string;
  subjectTraitValue?: string;
  contactId?: string;
  permissionCode?: string;
  recordType?: string;
  validFrom?: string;
  validTo?: string;
}
