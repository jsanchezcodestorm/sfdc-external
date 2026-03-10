export type SetupGoogleConfigMode = 'env';

export interface SetupStatusResponse {
  state: 'pending' | 'completed';
  siteName?: string;
  googleConfigMode: SetupGoogleConfigMode;
}

export type SetupSalesforceModeValue = 'username-password' | 'access-token';

export interface SetupSalesforceUsernamePasswordConfig {
  mode: 'username-password';
  loginUrl: string;
  username: string;
  password: string;
  securityToken?: string;
}

export interface SetupSalesforceAccessTokenConfig {
  mode: 'access-token';
  instanceUrl: string;
  accessToken: string;
}

export type SetupSalesforceConfig =
  | SetupSalesforceUsernamePasswordConfig
  | SetupSalesforceAccessTokenConfig;

export interface SetupSalesforceTestResponse {
  success: true;
  organizationId?: string;
  instanceUrl?: string;
  username?: string;
}

export interface CompletedSetup {
  siteName: string;
  adminEmail: string;
  salesforce: SetupSalesforceConfig;
  completedAt: string;
}
