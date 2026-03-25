import type { SubjectTraits } from '@platform/contracts-auth';

export interface SessionUser {
  sub: string;
  identityId?: string;
  email: string;
  permissions: string[];
  subjectTraits?: SubjectTraits;
  legacySubjectIds?: string[];
  contactRecordTypeDeveloperName?: string;
  authProvider?: string;
  authMethod?: 'oidc' | 'local';
}
