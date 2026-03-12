import type { SessionUser } from './session-user.interface';

export type AuthProviderKind = 'oidc' | 'local';
export type OidcProviderFamily = 'google' | 'entra-id' | 'auth0' | 'custom';
export type AuthProviderFamily = OidcProviderFamily | 'local';
export type AuthProviderStatus = 'active' | 'disabled' | 'not_configured' | 'misconfigured';

export interface AuthSessionResponse {
  user: SessionUser;
  csrfToken: string;
}

export interface AuthPublicProviderItem {
  id: string;
  type: AuthProviderKind;
  label: string;
  loginPath?: string;
}

export interface AuthProvidersResponse {
  items: AuthPublicProviderItem[];
}

export interface AuthAdminProviderItem {
  id: string;
  providerFamily: AuthProviderFamily;
  type: AuthProviderKind;
  label: string;
  enabled: boolean;
  sortOrder: number;
  isConfigured: boolean;
  isRuntimeAvailable: boolean;
  hasClientSecret: boolean;
  status: AuthProviderStatus;
  loginPath?: string;
  issuer?: string;
}

export interface AuthAdminProvidersResponse {
  items: AuthAdminProviderItem[];
}

export interface AuthAdminProviderDetailItem extends AuthAdminProviderItem {
  clientId?: string;
  callbackUri?: string;
  scopes?: string[];
  tenantId?: string;
  domain?: string;
}

export interface AuthAdminProviderResponse {
  provider: AuthAdminProviderItem;
}

export interface AuthAdminProviderDetailResponse {
  provider: AuthAdminProviderDetailItem;
}

export interface LocalCredentialAdminItem {
  contactId: string;
  username: string;
  enabled: boolean;
  failedAttempts: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  updatedAt: string;
  contactName?: string;
  contactEmail?: string;
  contactRecordTypeDeveloperName?: string;
}

export interface LocalCredentialAdminListResponse {
  items: LocalCredentialAdminItem[];
}

export interface LocalCredentialAdminResponse {
  credential: LocalCredentialAdminItem;
}

export interface AuthProviderAdminInput {
  label?: string;
  enabled?: boolean;
  sortOrder?: number;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  domain?: string;
  issuer?: string;
  scopes?: string[];
}

export interface LocalCredentialUpsertInput {
  password?: string;
  enabled?: boolean;
}

export interface RuntimeAuthProvider {
  id: string;
  providerFamily: AuthProviderFamily;
  type: AuthProviderKind;
  label: string;
  envEnabled: boolean;
  defaultSortOrder: number;
  isConfigured: boolean;
  isRuntimeAvailable: boolean;
  loginPath?: string;
  issuer?: string;
}

export interface LocalRuntimeProvider extends RuntimeAuthProvider {
  type: 'local';
}

export interface OidcRuntimeProvider extends RuntimeAuthProvider {
  type: 'oidc';
  providerFamily: OidcProviderFamily;
  issuer: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export type RegisteredRuntimeAuthProvider = LocalRuntimeProvider | OidcRuntimeProvider;

export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface StoredOidcProviderConfigBase {
  providerFamily: OidcProviderFamily;
  issuer: string;
  discoveryUrl: string;
  clientId: string;
  scopes: string[];
}

export interface GoogleStoredOidcProviderConfig extends StoredOidcProviderConfigBase {
  providerFamily: 'google';
}

export interface EntraIdStoredOidcProviderConfig extends StoredOidcProviderConfigBase {
  providerFamily: 'entra-id';
  tenantId: string;
}

export interface Auth0StoredOidcProviderConfig extends StoredOidcProviderConfigBase {
  providerFamily: 'auth0';
  domain: string;
}

export interface CustomStoredOidcProviderConfig extends StoredOidcProviderConfigBase {
  providerFamily: 'custom';
}

export type StoredOidcProviderConfig =
  | GoogleStoredOidcProviderConfig
  | EntraIdStoredOidcProviderConfig
  | Auth0StoredOidcProviderConfig
  | CustomStoredOidcProviderConfig;
