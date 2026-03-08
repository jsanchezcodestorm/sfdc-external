export type SessionUser = {
  sub: string
  email: string
  permissions: string[]
  contactRecordTypeDeveloperName?: string
}

export type AuthSessionResponse = {
  user: SessionUser
  csrfToken: string
}
