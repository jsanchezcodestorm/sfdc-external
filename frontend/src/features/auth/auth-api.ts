import { createAuthClient } from '@platform/auth-client'

import { apiFetch } from '../../lib/api'

import type { AuthProvidersResponse } from './auth-types'

const authClient = createAuthClient({ apiFetch })

export function fetchAuthProviders(): Promise<AuthProvidersResponse> {
  return authClient.fetchAuthProviders()
}
