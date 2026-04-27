import type { VisibilityRuleEffect } from '@prisma/client';

import type {
  VisibilityAssignmentDefinition,
  VisibilityEvaluation,
  VisibilityRuleDefinition,
} from './visibility.types';

export type VisibilityDebugPreviewScalar = string | number | boolean | null;
export type VisibilityDebugPreviewSkipReason = 'VISIBILITY_DENY' | 'NO_VISIBLE_FIELDS';

export interface VisibilityDebugPreviewResponse {
  visibility: VisibilityEvaluation;
  selectedFields: string[];
  soql?: string;
  records: Array<Record<string, VisibilityDebugPreviewScalar>>;
  rowCount: number;
  executed: boolean;
  executionSkippedReason?: VisibilityDebugPreviewSkipReason;
}

export interface VisibilityConeSummaryResponse {
  id: string;
  code: string;
  name: string;
  priority: number;
  active: boolean;
  ruleCount: number;
  assignmentCount: number;
  updatedAt: string;
}

export interface VisibilityConeDetailResponse {
  cone: {
    id: string;
    code: string;
    name: string;
    priority: number;
    active: boolean;
  };
  ruleCount: number;
  assignmentCount: number;
}

export interface VisibilityRuleSummaryResponse {
  id: string;
  coneId: string;
  coneCode: string;
  objectApiName: string;
  description?: string;
  effect: VisibilityRuleEffect;
  active: boolean;
  fieldsAllowedCount: number;
  fieldsDeniedCount: number;
  updatedAt: string;
}

export interface VisibilityRuleDetailResponse {
  rule: VisibilityRuleDefinition;
}

export interface VisibilityAssignmentSummaryResponse {
  id: string;
  coneId: string;
  coneCode: string;
  contactId?: string;
  permissionCode?: string;
  recordType?: string;
  validFrom?: string;
  validTo?: string;
  isCurrentlyApplicable: boolean;
  updatedAt: string;
}

export interface VisibilityAssignmentDetailResponse {
  assignment: VisibilityAssignmentDefinition;
}

export interface VisibilityDebugContactSuggestion {
  id: string;
  name?: string;
  recordTypeDeveloperName?: string;
}
