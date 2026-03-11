import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { readAllowedFrontendOrigins } from '../common/utils/frontend-origins';
import { SetupSecretsService } from '../setup/setup-secrets.service';

import { AuthProviderAdminRepository } from './auth-provider-admin.repository';
import { getAuthProviderSlot } from './auth-provider-catalog';
import { parseStoredOidcProviderConfig } from './auth-provider-config';
import type {
  LocalRuntimeProvider,
  OidcDiscoveryDocument,
  OidcRuntimeProvider,
  RegisteredRuntimeAuthProvider
} from './auth.types';

@Injectable()
export class AuthProviderRegistryService {
  private readonly discoveryCache = new Map<string, Promise<OidcDiscoveryDocument>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly setupSecretsService: SetupSecretsService,
    private readonly authProviderAdminRepository: AuthProviderAdminRepository
  ) {}

  async listRuntimeProviders(): Promise<RegisteredRuntimeAuthProvider[]> {
    const configs = await this.authProviderAdminRepository.listConfigs();
    const oidcProviders = configs
      .map((config) => this.buildRuntimeOidcProvider(config))
      .filter((provider): provider is OidcRuntimeProvider => provider !== null);

    return [...oidcProviders, this.readLocalProvider()];
  }

  async getRuntimeProvider(providerId: string): Promise<RegisteredRuntimeAuthProvider | undefined> {
    const normalizedProviderId = this.normalizeProviderId(providerId);

    if (normalizedProviderId === 'local') {
      return this.readLocalProvider();
    }

    const config = await this.authProviderAdminRepository.findConfig(normalizedProviderId);

    if (!config) {
      return undefined;
    }

    return this.buildRuntimeOidcProvider(config) ?? undefined;
  }

  async getOidcRuntimeProvider(providerId: string): Promise<OidcRuntimeProvider> {
    const provider = await this.getRuntimeProvider(providerId);

    if (!provider || provider.type !== 'oidc') {
      throw new ServiceUnavailableException(`OIDC provider ${providerId} is not registered`);
    }

    if (!provider.isConfigured) {
      throw new ServiceUnavailableException(`OIDC provider ${providerId} is not configured`);
    }

    return provider;
  }

  getFrontendLoginUrl(search?: Record<string, string | undefined>): string {
    const frontendOrigin = readAllowedFrontendOrigins(this.configService)[0];
    const suffix = this.buildLoginHash(search);

    if (!frontendOrigin) {
      return `/${suffix}`;
    }

    const url = new URL('/', frontendOrigin);
    url.hash = suffix.slice(1);
    return url.toString();
  }

  async loadOidcDiscovery(providerId: string): Promise<OidcDiscoveryDocument> {
    const provider = await this.getOidcRuntimeProvider(providerId);
    const cacheKey = `${provider.id}:${provider.discoveryUrl}`;
    const cached = this.discoveryCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const promise = this.fetchOidcDiscovery(provider);
    this.discoveryCache.set(cacheKey, promise);

    try {
      return await promise;
    } catch (error) {
      this.discoveryCache.delete(cacheKey);
      throw error;
    }
  }

  async verifyOidcIdToken(
    providerId: string,
    idToken: string,
    nonce: string
  ): Promise<{ email: string }> {
    const provider = await this.getOidcRuntimeProvider(providerId);
    const discovery = await this.loadOidcDiscovery(providerId);
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    const verification = await jwtVerify(idToken, jwks, {
      issuer: discovery.issuer,
      audience: provider.clientId
    });
    const payload = verification.payload as Record<string, unknown>;

    if (payload.nonce !== nonce) {
      throw new ServiceUnavailableException(`OIDC nonce validation failed for ${providerId}`);
    }

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

    if (!email || !emailVerified) {
      throw new ServiceUnavailableException(
        `OIDC provider ${providerId} did not return a verified email`
      );
    }

    return { email };
  }

  private buildRuntimeOidcProvider(config: {
    providerId: string;
    label: string | null;
    enabled: boolean;
    sortOrder: number;
    configJson: unknown;
    clientSecretEncrypted: string | null;
  }): OidcRuntimeProvider | null {
    const slot = getAuthProviderSlot(config.providerId);

    if (!slot || slot.type !== 'oidc') {
      return null;
    }

    const parsedConfig = parseStoredOidcProviderConfig(config.providerId, config.configJson);

    if (!parsedConfig.config || !config.clientSecretEncrypted) {
      return null;
    }

    let clientSecret: string;

    try {
      clientSecret = this.setupSecretsService.decryptJson<string>(config.clientSecretEncrypted);
    } catch {
      return null;
    }

    if (typeof clientSecret !== 'string' || clientSecret.trim().length === 0) {
      return null;
    }

    return {
      id: config.providerId,
      providerFamily: parsedConfig.config.providerFamily,
      type: 'oidc',
      label: config.label?.trim() || slot.label,
      envEnabled: config.enabled,
      defaultSortOrder: config.sortOrder,
      isConfigured: true,
      isRuntimeAvailable: true,
      loginPath: `/api/auth/oidc/${config.providerId}/start`,
      issuer: parsedConfig.config.issuer,
      discoveryUrl: parsedConfig.config.discoveryUrl,
      clientId: parsedConfig.config.clientId,
      clientSecret: clientSecret.trim(),
      scopes: [...parsedConfig.config.scopes]
    };
  }

  private readLocalProvider(): LocalRuntimeProvider {
    const slot = getAuthProviderSlot('local');

    if (!slot) {
      throw new ServiceUnavailableException('Local auth provider slot is not configured');
    }

    return {
      id: slot.id,
      providerFamily: 'local',
      type: 'local',
      label: this.readOptionalString('LOCAL_AUTH_LABEL') ?? slot.label,
      envEnabled: this.readBoolean('LOCAL_AUTH_ENABLED', true),
      defaultSortOrder: slot.defaultSortOrder,
      isConfigured: this.setupSecretsService.isConfigured(),
      isRuntimeAvailable: true
    };
  }

  private async fetchOidcDiscovery(provider: OidcRuntimeProvider): Promise<OidcDiscoveryDocument> {
    const response = await fetch(provider.discoveryUrl);

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Unable to load OIDC discovery for ${provider.id}: ${response.status}`
      );
    }

    const payload = (await response.json()) as Partial<OidcDiscoveryDocument>;

    if (
      typeof payload.issuer !== 'string' ||
      typeof payload.authorization_endpoint !== 'string' ||
      typeof payload.token_endpoint !== 'string' ||
      typeof payload.jwks_uri !== 'string'
    ) {
      throw new ServiceUnavailableException(
        `OIDC discovery payload for ${provider.id} is invalid`
      );
    }

    return {
      issuer: payload.issuer,
      authorization_endpoint: payload.authorization_endpoint,
      token_endpoint: payload.token_endpoint,
      jwks_uri: payload.jwks_uri
    };
  }

  private buildLoginHash(search?: Record<string, string | undefined>): string {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(search ?? {})) {
      if (typeof value === 'string' && value.length > 0) {
        params.set(key, value);
      }
    }

    const query = params.toString();
    return `#/login${query ? `?${query}` : ''}`;
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key);

    if (!raw) {
      return fallback;
    }

    const normalized = raw.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return fallback;
  }

  private readOptionalString(key: string): string | null {
    const normalized = this.configService.get<string>(key)?.trim();
    return normalized ? normalized : null;
  }

  private normalizeProviderId(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  }
}
