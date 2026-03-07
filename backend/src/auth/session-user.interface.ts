export interface SessionUser {
  sub: string;
  email: string;
  permissions: string[];
  contactRecordTypeDeveloperName?: string;
}
