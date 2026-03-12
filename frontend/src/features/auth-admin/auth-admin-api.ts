import { apiFetch } from '../../lib/api'

import type {
  AuthAdminProviderDetailResponse,
  AuthAdminProviderInput,
  AuthAdminLocalCredentialListResponse,
  AuthAdminLocalCredentialResponse,
  AuthAdminProviderResponse,
  AuthAdminProvidersResponse,
} from './auth-admin-types'

export function fetchAuthAdminProviders(): Promise<AuthAdminProvidersResponse> {
  return apiFetch<AuthAdminProvidersResponse>('/auth/admin/providers')
}

export function fetchAuthAdminProvider(
  providerId: string,
): Promise<AuthAdminProviderDetailResponse> {
  return apiFetch<AuthAdminProviderDetailResponse>(
    `/auth/admin/providers/${encodeURIComponent(providerId)}`,
  )
}

export function updateAuthAdminProvider(
  providerId: string,
  provider: AuthAdminProviderInput,
): Promise<AuthAdminProviderResponse> {
  return apiFetch<AuthAdminProviderResponse>(`/auth/admin/providers/${encodeURIComponent(providerId)}`, {
    method: 'PUT',
    body: {
      provider,
    },
  })
}

export function fetchAuthAdminLocalCredentials(): Promise<AuthAdminLocalCredentialListResponse> {
  return apiFetch<AuthAdminLocalCredentialListResponse>('/auth/admin/local-credentials')
}

export function upsertAuthAdminLocalCredential(
  contactId: string,
  credential: {
    password?: string
    enabled?: boolean
  },
): Promise<AuthAdminLocalCredentialResponse> {
  return apiFetch<AuthAdminLocalCredentialResponse>(
    `/auth/admin/local-credentials/${encodeURIComponent(contactId)}`,
    {
      method: 'PUT',
      body: {
        credential,
      },
    },
  )
}

export function deleteAuthAdminLocalCredential(contactId: string): Promise<void> {
  return apiFetch<void>(`/auth/admin/local-credentials/${encodeURIComponent(contactId)}`, {
    method: 'DELETE',
  })
}
