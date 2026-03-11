import { apiFetch } from '../../lib/api'

import type { AuthProvidersResponse } from './auth-types'

export function fetchAuthProviders(): Promise<AuthProvidersResponse> {
  return apiFetch<AuthProvidersResponse>('/auth/providers')
}
