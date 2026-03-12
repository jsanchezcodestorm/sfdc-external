export type SetupStatusResponse = {
  state: 'pending' | 'completed'
  siteName?: string
  authConfigMode: 'database'
}

export type SetupSalesforceConfig =
  | {
      mode: 'username-password'
      loginUrl: string
      username: string
      password: string
      securityToken?: string
    }
  | {
      mode: 'access-token'
      instanceUrl: string
      accessToken: string
    }

export type SetupSalesforceTestResponse = {
  success: true
  organizationId?: string
  instanceUrl?: string
  username?: string
}

export type CompleteSetupRequest = {
  siteName: string
  adminEmail: string
  bootstrapPassword: string
  salesforce: SetupSalesforceConfig
}
