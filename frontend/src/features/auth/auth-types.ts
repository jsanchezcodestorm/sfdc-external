import type {
  AuthProviderItem,
  AuthProvidersResponse as SharedAuthProvidersResponse,
  SessionUser,
} from '@platform/contracts-auth'

export type { SessionUser, AuthProviderItem }

export type AuthProvidersResponse = SharedAuthProvidersResponse

export type AuthSessionResponse = {
  user: SessionUser
  csrfToken: string
}
