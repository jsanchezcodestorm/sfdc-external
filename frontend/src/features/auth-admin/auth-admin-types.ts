export type AuthAdminProviderItem = {
  id: string
  providerFamily: 'google' | 'entra-id' | 'auth0' | 'custom' | 'local'
  type: 'oidc' | 'local'
  label: string
  enabled: boolean
  sortOrder: number
  isConfigured: boolean
  isRuntimeAvailable: boolean
  hasClientSecret: boolean
  status: 'active' | 'disabled' | 'not_configured' | 'misconfigured'
  loginPath?: string
  issuer?: string
}

export type AuthAdminProvidersResponse = {
  items: AuthAdminProviderItem[]
}

export type AuthAdminProviderDetailItem = AuthAdminProviderItem & {
  clientId?: string
  callbackUri?: string
  scopes?: string[]
  tenantId?: string
  domain?: string
}

export type AuthAdminProviderResponse = {
  provider: AuthAdminProviderItem
}

export type AuthAdminProviderDetailResponse = {
  provider: AuthAdminProviderDetailItem
}

export type AuthAdminProviderInput = {
  label?: string
  enabled?: boolean
  sortOrder?: number
  clientId?: string
  clientSecret?: string
  tenantId?: string
  domain?: string
  issuer?: string
  scopes?: string[]
}

export type AuthAdminLocalCredentialItem = {
  contactId: string
  username: string
  enabled: boolean
  failedAttempts: number
  lockedUntil?: string
  lastLoginAt?: string
  updatedAt: string
  contactName?: string
  contactEmail?: string
  contactRecordTypeDeveloperName?: string
}

export type AuthAdminLocalCredentialListResponse = {
  items: AuthAdminLocalCredentialItem[]
}

export type AuthAdminLocalCredentialResponse = {
  credential: AuthAdminLocalCredentialItem
}
