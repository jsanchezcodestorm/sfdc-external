import type { AuthProviderFamily, AuthProviderKind, OidcProviderFamily } from './auth.types';

export const DEFAULT_OIDC_SCOPES = ['openid', 'email', 'profile'] as const;

export interface AuthProviderSlotDefinition {
  id: AuthProviderFamily;
  providerFamily: AuthProviderFamily;
  type: AuthProviderKind;
  label: string;
  defaultSortOrder: number;
}

export const AUTH_PROVIDER_SLOTS: readonly AuthProviderSlotDefinition[] = [
  {
    id: 'google',
    providerFamily: 'google',
    type: 'oidc',
    label: 'Google',
    defaultSortOrder: 0
  },
  {
    id: 'entra-id',
    providerFamily: 'entra-id',
    type: 'oidc',
    label: 'Microsoft Entra ID',
    defaultSortOrder: 10
  },
  {
    id: 'auth0',
    providerFamily: 'auth0',
    type: 'oidc',
    label: 'Auth0',
    defaultSortOrder: 20
  },
  {
    id: 'custom',
    providerFamily: 'custom',
    type: 'oidc',
    label: 'Custom OIDC',
    defaultSortOrder: 30
  },
  {
    id: 'local',
    providerFamily: 'local',
    type: 'local',
    label: 'Username e password',
    defaultSortOrder: 100
  }
] as const;

export function getAuthProviderSlot(providerId: string): AuthProviderSlotDefinition | undefined {
  const normalizedProviderId = normalizeProviderId(providerId);
  return AUTH_PROVIDER_SLOTS.find((slot) => slot.id === normalizedProviderId);
}

export function listOidcProviderSlots(): AuthProviderSlotDefinition[] {
  return AUTH_PROVIDER_SLOTS.filter((slot) => slot.type === 'oidc');
}

export function isOidcProviderFamily(value: string): value is OidcProviderFamily {
  return listOidcProviderSlots().some((slot) => slot.id === normalizeProviderId(value));
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}
