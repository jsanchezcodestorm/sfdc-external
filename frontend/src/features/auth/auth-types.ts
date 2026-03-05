export type SessionUser = {
  sub: string
  email: string
  permissions: string[]
}

export type AuthSessionResponse = {
  user: SessionUser
}
