export type SessionUser = {
  sub: string
  email: string
  permissions: string[]
  contactRecordTypeDeveloperName?: string
  authProvider?: string
  authMethod?: 'oidc' | 'local'
}

export type AuthSessionResponse = {
  user: SessionUser
  csrfToken: string
}

export type AuthProviderItem = {
  id: string
  type: 'oidc' | 'local'
  label: string
  loginPath?: string
}

export type AuthProvidersResponse = {
  items: AuthProviderItem[]
}
