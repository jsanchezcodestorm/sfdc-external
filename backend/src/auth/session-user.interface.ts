export interface SessionUser {
  sub: string;
  identityId?: string;
  email: string;
  permissions: string[];
  contactRecordTypeDeveloperName?: string;
  authProvider?: string;
  authMethod?: 'oidc' | 'local';
}
