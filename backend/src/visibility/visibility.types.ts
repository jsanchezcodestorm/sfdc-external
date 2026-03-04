import type { SessionUser } from '../auth/session-user.interface';

export type VisibilityDecision = 'ALLOW' | 'DENY';

export interface VisibilityEvaluation {
  decision: VisibilityDecision;
  reasonCode: string;
  policyVersion: number;
  objectApiName: string;
  contactId: string;
  appliedCones: string[];
  appliedRules: string[];
}

export interface VisibilityContext {
  user: SessionUser;
  objectApiName: string;
}
