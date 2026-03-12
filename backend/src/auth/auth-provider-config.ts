import { BadRequestException } from '@nestjs/common';

import { DEFAULT_OIDC_SCOPES, getAuthProviderSlot } from './auth-provider-catalog';
import type {
  AuthProviderAdminInput,
  AuthProviderFamily,
  OidcProviderFamily,
  StoredOidcProviderConfig
} from './auth.types';

export interface ParsedStoredOidcProviderConfig {
  config: StoredOidcProviderConfig | null;
  error?: string;
}

export interface NormalizedAuthProviderUpsert {
  providerId: AuthProviderFamily;
  type: 'LOCAL' | 'OIDC';
  label?: string;
  enabled: boolean;
  sortOrder: number;
  configJson?: StoredOidcProviderConfig | null;
  clientSecret?: string;
}

interface ExistingAuthProviderRecord {
  label?: string | null;
  enabled?: boolean;
  sortOrder?: number;
  configJson?: unknown;
}

export function normalizeAuthProviderUpsert(
  providerId: string,
  input: AuthProviderAdminInput,
  existing?: ExistingAuthProviderRecord
): NormalizedAuthProviderUpsert {
  const slot = getAuthProviderSlot(providerId);

  if (!slot) {
    throw new BadRequestException(`Unsupported auth provider ${providerId}`);
  }

  const label = normalizeOptionalString(input.label, 'provider.label', 128) ?? existing?.label?.trim() ?? undefined;
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : existing?.enabled ?? true;
  const sortOrder =
    typeof input.sortOrder === 'number' ? input.sortOrder : existing?.sortOrder ?? slot.defaultSortOrder;

  if (slot.id === 'custom' && !label) {
    throw new BadRequestException('provider.label is required for custom OIDC providers');
  }

  if (slot.type === 'local') {
    return {
      providerId: slot.id,
      type: 'LOCAL',
      label,
      enabled,
      sortOrder,
      configJson: null
    };
  }

  return {
    providerId: slot.id,
    type: 'OIDC',
    label,
    enabled,
    sortOrder,
    configJson: normalizeOidcProviderConfig(slot.providerFamily as OidcProviderFamily, input),
    clientSecret: normalizeRequiredString(input.clientSecret, 'provider.clientSecret', 4096)
  };
}

export function normalizeAuthProviderUpdate(
  providerId: string,
  input: AuthProviderAdminInput,
  existing?: ExistingAuthProviderRecord & { clientSecretEncrypted?: string | null }
): NormalizedAuthProviderUpsert {
  const slot = getAuthProviderSlot(providerId);

  if (!slot) {
    throw new BadRequestException(`Unsupported auth provider ${providerId}`);
  }

  if (!existing) {
    return normalizeAuthProviderUpsert(providerId, input);
  }

  const label = normalizeOptionalString(input.label, 'provider.label', 128) ?? existing.label?.trim() ?? undefined;
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : existing.enabled ?? true;
  const sortOrder =
    typeof input.sortOrder === 'number' ? input.sortOrder : existing.sortOrder ?? slot.defaultSortOrder;

  if (slot.id === 'custom' && !label) {
    throw new BadRequestException('provider.label is required for custom OIDC providers');
  }

  if (slot.type === 'local') {
    return {
      providerId: slot.id,
      type: 'LOCAL',
      label,
      enabled,
      sortOrder,
      configJson: null
    };
  }

  const clientSecret =
    normalizeOptionalString(input.clientSecret, 'provider.clientSecret', 4096) ?? undefined;

  if (!clientSecret && !existing.clientSecretEncrypted) {
    throw new BadRequestException(
      'provider.clientSecret is required until the provider has a stored client secret'
    );
  }

  return {
    providerId: slot.id,
    type: 'OIDC',
    label,
    enabled,
    sortOrder,
    configJson: normalizeOidcProviderConfig(slot.providerFamily as OidcProviderFamily, input),
    clientSecret
  };
}

export function parseStoredOidcProviderConfig(
  providerId: string,
  value: unknown
): ParsedStoredOidcProviderConfig {
  try {
    const slot = getAuthProviderSlot(providerId);

    if (!slot || slot.type !== 'oidc') {
      return { config: null, error: `Unsupported OIDC provider ${providerId}` };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { config: null };
    }

    const payload = value as Record<string, unknown>;
    const providerFamily = normalizeOptionalString(payload.providerFamily, 'config.providerFamily', 32);

    if (providerFamily !== slot.providerFamily) {
      return { config: null, error: `Stored providerFamily does not match ${providerId}` };
    }

    const issuer = normalizeOptionalString(payload.issuer, 'config.issuer', 2048);
    const discoveryUrl = normalizeOptionalString(payload.discoveryUrl, 'config.discoveryUrl', 2048);
    const clientId = normalizeOptionalString(payload.clientId, 'config.clientId', 2048);
    const scopes = normalizeScopes(payload.scopes, true);

    if (!issuer || !discoveryUrl || !clientId || scopes.length === 0) {
      return { config: null, error: `Stored OIDC config for ${providerId} is incomplete` };
    }

    if (slot.id === 'entra-id') {
      const tenantId = normalizeOptionalString(payload.tenantId, 'config.tenantId', 256);

      if (!tenantId) {
        return { config: null, error: 'Stored tenantId is missing' };
      }

      return {
        config: {
          providerFamily: 'entra-id',
          tenantId,
          issuer,
          discoveryUrl,
          clientId,
          scopes
        }
      };
    }

    if (slot.id === 'auth0') {
      const domain = normalizeOptionalString(payload.domain, 'config.domain', 512);

      if (!domain) {
        return { config: null, error: 'Stored domain is missing' };
      }

      return {
        config: {
          providerFamily: 'auth0',
          domain,
          issuer,
          discoveryUrl,
          clientId,
          scopes
        }
      };
    }

    if (slot.id === 'google') {
      return {
        config: {
          providerFamily: 'google',
          issuer,
          discoveryUrl,
          clientId,
          scopes
        }
      };
    }

    return {
      config: {
        providerFamily: 'custom',
        issuer,
        discoveryUrl,
        clientId,
        scopes
      }
    };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error.message : `Stored OIDC config for ${providerId} is invalid`
    };
  }
}

function normalizeOidcProviderConfig(
  providerId: OidcProviderFamily,
  input: AuthProviderAdminInput
): StoredOidcProviderConfig {
  const clientId = normalizeRequiredString(input.clientId, 'provider.clientId', 2048);
  const scopes =
    providerId === 'custom'
      ? normalizeScopes(input.scopes, false)
      : [...DEFAULT_OIDC_SCOPES];

  if (providerId === 'google') {
    const issuer = 'https://accounts.google.com';

    return {
      providerFamily: 'google',
      issuer,
      discoveryUrl: `${issuer}/.well-known/openid-configuration`,
      clientId,
      scopes
    };
  }

  if (providerId === 'entra-id') {
    const tenantId = normalizeRequiredString(input.tenantId, 'provider.tenantId', 256);
    const issuer = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0`;

    return {
      providerFamily: 'entra-id',
      tenantId,
      issuer,
      discoveryUrl: `${issuer}/.well-known/openid-configuration`,
      clientId,
      scopes
    };
  }

  if (providerId === 'auth0') {
    const domain = normalizeDomain(input.domain, 'provider.domain');
    const issuer = domain;

    return {
      providerFamily: 'auth0',
      domain,
      issuer,
      discoveryUrl: `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
      clientId,
      scopes
    };
  }

  const issuer = normalizeUrl(input.issuer, 'provider.issuer');

  return {
      providerFamily: 'custom',
      issuer,
      discoveryUrl: `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
      clientId,
      scopes
    };
}

function normalizeRequiredString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} is required`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  if (normalized.length > maxLength) {
    throw new BadRequestException(`${fieldName} must be at most ${maxLength} characters`);
  }

  return normalized;
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > maxLength) {
    throw new BadRequestException(`${fieldName} must be at most ${maxLength} characters`);
  }

  return normalized;
}

function normalizeUrl(value: unknown, fieldName: string): string {
  const normalized = normalizeRequiredString(value, fieldName, 2048);

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new BadRequestException(`${fieldName} must be a valid URL`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException(`${fieldName} must use http or https`);
  }

  return parsed.toString().replace(/\/$/, '');
}

function normalizeDomain(value: unknown, fieldName: string): string {
  const normalized = normalizeRequiredString(value, fieldName, 512);
  const candidate = /^[a-z]+:\/\//i.test(normalized) ? normalized : `https://${normalized}`;

  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new BadRequestException(`${fieldName} must be a valid domain or URL`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException(`${fieldName} must use http or https`);
  }

  return parsed.origin;
}

function normalizeScopes(value: unknown, allowMissing: boolean): string[] {
  if (value === undefined || value === null) {
    return allowMissing ? [] : [...DEFAULT_OIDC_SCOPES];
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException('provider.scopes must be an array of strings');
  }

  const items = value
    .map((entry) => {
      if (typeof entry !== 'string') {
        throw new BadRequestException('provider.scopes must be an array of strings');
      }

      return entry.trim();
    })
    .filter((entry) => entry.length > 0);

  const scopes = [...new Set(items)];

  if (!allowMissing && scopes.length === 0) {
    return [...DEFAULT_OIDC_SCOPES];
  }

  return scopes;
}
