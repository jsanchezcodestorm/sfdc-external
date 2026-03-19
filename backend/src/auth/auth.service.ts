import { randomBytes, createHash } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request } from 'express';
import { sign, verify, type JwtPayload } from 'jsonwebtoken';

import { AclContactPermissionsRepository } from '../acl/acl-contact-permissions.repository';
import { AclService } from '../acl/acl.service';
import { SalesforceService } from '../salesforce/salesforce.service';
import { SetupService } from '../setup/setup.service';

import { AuthProviderAdminService } from './auth-provider-admin.service';
import { AuthProviderRegistryService } from './auth-provider-registry.service';
import { AuthPublicOriginService } from './auth-public-origin.service';
import type { AuthProvidersResponse } from './auth.types';
import { LocalCredentialPasswordService } from './local-credential-password.service';
import { LocalCredentialRepository } from './local-credential.repository';
import { LocalLoginRateLimiterService } from './local-login-rate-limiter.service';
import type { SessionUser } from './session-user.interface';

interface SessionTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  permissions: string[];
  contactRecordTypeDeveloperName?: string;
  authProvider?: string;
  authMethod?: 'oidc' | 'local';
}

interface OidcFlowTokenPayload extends JwtPayload {
  providerId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresInSeconds: number;
  private readonly localAuthLockoutThreshold: number;
  private readonly localAuthLockoutSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly aclService: AclService,
    private readonly aclContactPermissionsRepository: AclContactPermissionsRepository,
    private readonly authProviderRegistryService: AuthProviderRegistryService,
    private readonly authProviderAdminService: AuthProviderAdminService,
    private readonly authPublicOriginService: AuthPublicOriginService,
    private readonly localCredentialPasswordService: LocalCredentialPasswordService,
    private readonly localCredentialRepository: LocalCredentialRepository,
    private readonly localLoginRateLimiterService: LocalLoginRateLimiterService,
    private readonly setupService: SetupService,
    @Inject(forwardRef(() => SalesforceService))
    private readonly salesforceService: SalesforceService
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET', 'change-me-in-production');
    this.jwtExpiresInSeconds = this.readPositiveIntEnv('JWT_EXPIRES_IN_SECONDS', 3600);
    this.localAuthLockoutThreshold = this.readPositiveIntEnv('LOCAL_AUTH_LOCKOUT_THRESHOLD', 5);
    this.localAuthLockoutSeconds = this.readPositiveIntEnv('LOCAL_AUTH_LOCKOUT_SECONDS', 900);
  }

  listPublicProviders(): Promise<AuthProvidersResponse> {
    return this.authProviderAdminService.getPublicProviders();
  }

  async createOidcLoginStart(
    providerId: string,
    request: Pick<Request, 'headers' | 'protocol' | 'get'>
  ): Promise<{
    redirectUrl: string;
    flowToken: string;
  }> {
    await this.assertPublicProvider(providerId, 'oidc');
    const provider = await this.authProviderRegistryService.getOidcRuntimeProvider(providerId);
    const discovery = await this.authProviderRegistryService.loadOidcDiscovery(providerId);
    const publicOrigin = this.authPublicOriginService.resolveAllowedOrigin(request);

    if (!publicOrigin) {
      throw new UnauthorizedException('OIDC login origin is not allowed');
    }

    const redirectUri = this.authPublicOriginService.buildOidcCallbackUri(publicOrigin, provider.id);
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const redirectUrl = new URL(discovery.authorization_endpoint);

    redirectUrl.searchParams.set('response_type', 'code');
    redirectUrl.searchParams.set('client_id', provider.clientId);
    redirectUrl.searchParams.set('redirect_uri', redirectUri);
    redirectUrl.searchParams.set('scope', provider.scopes.join(' '));
    redirectUrl.searchParams.set('state', state);
    redirectUrl.searchParams.set('nonce', nonce);
    redirectUrl.searchParams.set('code_challenge', codeChallenge);
    redirectUrl.searchParams.set('code_challenge_method', 'S256');

    return {
      redirectUrl: redirectUrl.toString(),
      flowToken: sign(
        {
          providerId: provider.id,
          state,
          nonce,
          codeVerifier,
          redirectUri
        },
        this.jwtSecret,
        {
          algorithm: 'HS256',
          expiresIn: 600
        }
      )
    };
  }

  async completeOidcLogin(
    providerId: string,
    input: {
      flowToken?: string;
      state?: string;
      code?: string;
      error?: string;
      errorDescription?: string;
    }
  ): Promise<{ token: string; user: SessionUser }> {
    await this.assertPublicProvider(providerId, 'oidc');
    const provider = await this.authProviderRegistryService.getOidcRuntimeProvider(providerId);

    if (!input.flowToken) {
      throw new UnauthorizedException('Missing OIDC flow token');
    }

    const flow = this.verifyAndDecodeOidcFlowToken(input.flowToken);

    if (flow.providerId !== provider.id || flow.state !== input.state) {
      throw new UnauthorizedException('OIDC state validation failed');
    }

    if (input.error) {
      throw new UnauthorizedException(input.errorDescription || input.error);
    }

    if (!input.code) {
      throw new UnauthorizedException('Missing OIDC authorization code');
    }

    const discovery = await this.authProviderRegistryService.loadOidcDiscovery(provider.id);
    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code: input.code,
        redirect_uri: flow.redirectUri,
        code_verifier: flow.codeVerifier
      }).toString()
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedException('OIDC token exchange failed');
    }

    const tokenPayload = (await tokenResponse.json()) as { id_token?: string };

    if (!tokenPayload.id_token) {
      throw new UnauthorizedException('OIDC token response missing id_token');
    }

    let externalIdentity: { email: string };

    try {
      externalIdentity = await this.authProviderRegistryService.verifyOidcIdToken(
        provider.id,
        tokenPayload.id_token,
        flow.nonce
      );
    } catch {
      throw new UnauthorizedException('OIDC id_token validation failed');
    }

    const contact = await this.resolveSalesforceContactByEmail(externalIdentity.email, provider.id);
    const user = await this.buildSessionUser(contact, {
      authMethod: 'oidc',
      authProvider: provider.id
    });

    return {
      token: this.issueSessionToken(user),
      user
    };
  }

  async loginWithPassword(
    username: string,
    password: string,
    ipAddress: string
  ): Promise<{ token: string; user: SessionUser }> {
    await this.assertPublicProvider('local', 'local');
    const normalizedUsername = this.normalizeEmail(username);
    const normalizedPassword = password.trim();

    if (!normalizedUsername || normalizedPassword.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const rateLimitKeys = this.getLocalRateLimitKeys(normalizedUsername, ipAddress);

    if (!rateLimitKeys.every((key) => this.localLoginRateLimiterService.isAllowed(key))) {
      rateLimitKeys.forEach((key) => this.localLoginRateLimiterService.recordFailure(key));
      throw new UnauthorizedException('Invalid credentials');
    }

    const credential = await this.localCredentialRepository.findByUsername(normalizedUsername);

    if (!credential || !credential.enabled) {
      rateLimitKeys.forEach((key) => this.localLoginRateLimiterService.recordFailure(key));
      throw new UnauthorizedException('Invalid credentials');
    }

    if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
      rateLimitKeys.forEach((key) => this.localLoginRateLimiterService.recordFailure(key));
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await this.localCredentialPasswordService.verifyPassword(
      credential.passwordHash,
      normalizedPassword
    );

    if (!passwordMatches) {
      rateLimitKeys.forEach((key) => this.localLoginRateLimiterService.recordFailure(key));
      await this.recordLocalCredentialFailure(credential.contactId, credential.failedAttempts + 1);
      throw new UnauthorizedException('Invalid credentials');
    }

    const contact = await this.resolveSalesforceContactById(credential.contactId);
    const user = await this.buildSessionUser(contact, {
      authMethod: 'local',
      authProvider: 'local'
    });

    await this.localCredentialRepository.recordSuccessfulLogin(contact.id, normalizedUsername);
    rateLimitKeys.forEach((key) => this.localLoginRateLimiterService.reset(key));

    return {
      token: this.issueSessionToken(user),
      user
    };
  }

  async verifySessionToken(token: string): Promise<SessionUser> {
    try {
      return this.mapSessionUserFromPayload(this.verifyAndDecodeSessionToken(token));
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  async refreshSessionUser(token: string): Promise<SessionUser> {
    try {
      const decoded = this.verifyAndDecodeSessionToken(token);

      return {
        ...this.mapSessionUserFromPayload(decoded),
        permissions: await this.resolveEffectivePermissions(decoded.sub, decoded.email)
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  issueSessionToken(user: SessionUser): string {
    return sign(
      {
        sub: user.sub,
        email: user.email,
        permissions: user.permissions,
        contactRecordTypeDeveloperName: user.contactRecordTypeDeveloperName,
        authProvider: user.authProvider,
        authMethod: user.authMethod
      },
      this.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.jwtExpiresInSeconds
      }
    );
  }

  getSessionCookieOptions(): CookieOptions {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: this.jwtExpiresInSeconds * 1000,
      path: '/'
    };
  }

  getClearCookieOptions(): CookieOptions {
    return {
      ...this.getSessionCookieOptions(),
      maxAge: 0
    };
  }

  getOidcFlowCookieOptions(providerId: string): CookieOptions {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: `/api/auth/oidc/${providerId}`
    };
  }

  getClearOidcFlowCookieOptions(providerId: string): CookieOptions {
    return {
      ...this.getOidcFlowCookieOptions(providerId),
      maxAge: 0
    };
  }

  getFrontendLoginRedirect(search?: Record<string, string | undefined>): string {
    return this.authProviderRegistryService.getFrontendLoginUrl(search);
  }

  private async assertPublicProvider(
    providerId: string,
    type: 'oidc' | 'local'
  ): Promise<void> {
    const providers = await this.authProviderAdminService.getPublicProviders();
    const provider = providers.items.find((entry) => entry.id === providerId && entry.type === type);

    if (!provider) {
      throw new UnauthorizedException(`Auth provider ${providerId} is not available`);
    }
  }

  private verifyAndDecodeSessionToken(token: string): SessionTokenPayload {
    const decoded = verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as SessionTokenPayload | string;

    if (typeof decoded === 'string') {
      throw new UnauthorizedException('Invalid session payload');
    }

    if (!this.isNonEmptyString(decoded.sub) || !this.isNonEmptyString(decoded.email)) {
      throw new UnauthorizedException('Invalid session payload');
    }

    if (!Array.isArray(decoded.permissions) || decoded.permissions.some((entry) => typeof entry !== 'string')) {
      throw new UnauthorizedException('Invalid session payload');
    }

    if (
      decoded.contactRecordTypeDeveloperName !== undefined &&
      typeof decoded.contactRecordTypeDeveloperName !== 'string'
    ) {
      throw new UnauthorizedException('Invalid session payload');
    }

    if (decoded.authProvider !== undefined && typeof decoded.authProvider !== 'string') {
      throw new UnauthorizedException('Invalid session payload');
    }

    if (
      decoded.authMethod !== undefined &&
      decoded.authMethod !== 'oidc' &&
      decoded.authMethod !== 'local'
    ) {
      throw new UnauthorizedException('Invalid session payload');
    }

    return decoded;
  }

  private verifyAndDecodeOidcFlowToken(token: string): OidcFlowTokenPayload {
    const decoded = verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as OidcFlowTokenPayload | string;

    if (typeof decoded === 'string') {
      throw new UnauthorizedException('Invalid OIDC flow payload');
    }

    if (
      !this.isNonEmptyString(decoded.providerId) ||
      !this.isNonEmptyString(decoded.state) ||
      !this.isNonEmptyString(decoded.nonce) ||
      !this.isNonEmptyString(decoded.codeVerifier) ||
      !this.isNonEmptyString(decoded.redirectUri)
    ) {
      throw new UnauthorizedException('Invalid OIDC flow payload');
    }

    return decoded;
  }

  private mapSessionUserFromPayload(decoded: SessionTokenPayload): SessionUser {
    return {
      sub: decoded.sub,
      email: decoded.email,
      permissions: this.aclService.normalizePermissions(decoded.permissions),
      contactRecordTypeDeveloperName: decoded.contactRecordTypeDeveloperName,
      authProvider: decoded.authProvider,
      authMethod: decoded.authMethod
    };
  }

  private async buildSessionUser(
    contact: { id: string; email: string; recordTypeDeveloperName?: string },
    authContext: { authMethod: 'oidc' | 'local'; authProvider: string }
  ): Promise<SessionUser> {
    return {
      sub: contact.id,
      email: contact.email,
      permissions: await this.resolveEffectivePermissions(contact.id, contact.email),
      contactRecordTypeDeveloperName: contact.recordTypeDeveloperName,
      authProvider: authContext.authProvider,
      authMethod: authContext.authMethod
    };
  }

  private async resolveEffectivePermissions(contactId: string, email: string): Promise<string[]> {
    const permissions = await this.aclContactPermissionsRepository.listPermissionCodesByContactId(contactId);
    const userEmail = this.normalizeEmail(email);
    const bootstrapAdminEmail = this.normalizeEmail(await this.setupService.getCompletedAdminEmail());

    if (bootstrapAdminEmail && userEmail === bootstrapAdminEmail) {
      permissions.push('PORTAL_ADMIN');
    }

    return this.aclService.normalizePermissions(permissions);
  }

  private async resolveSalesforceContactByEmail(
    email: string,
    providerId: string
  ): Promise<{ id: string; email: string; recordTypeDeveloperName?: string }> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      throw new UnauthorizedException(`OIDC provider ${providerId} did not return a verified email`);
    }

    const contact = await this.salesforceService.findContactByEmail(normalizedEmail);

    if (!contact) {
      throw new UnauthorizedException('No Salesforce Contact mapped to this account');
    }

    return {
      id: contact.id,
      email: this.normalizeEmail(contact.email) ?? normalizedEmail,
      recordTypeDeveloperName: contact.recordTypeDeveloperName
    };
  }

  private async resolveSalesforceContactById(
    contactId: string
  ): Promise<{ id: string; email: string; recordTypeDeveloperName?: string }> {
    const contact = await this.salesforceService.findContactById(contactId);

    if (!contact?.email) {
      throw new UnauthorizedException('Local credential is not linked to an active Salesforce Contact');
    }

    return {
      id: contact.id,
      email: this.normalizeEmail(contact.email) ?? contact.email,
      recordTypeDeveloperName: contact.recordTypeDeveloperName
    };
  }

  private async recordLocalCredentialFailure(contactId: string, failedAttempts: number): Promise<void> {
    const lockedUntil =
      failedAttempts >= this.localAuthLockoutThreshold
        ? new Date(Date.now() + this.localAuthLockoutSeconds * 1000)
        : null;

    await this.localCredentialRepository.recordFailedLogin(contactId, failedAttempts, lockedUntil);
  }

  private getLocalRateLimitKeys(username: string, ipAddress: string): string[] {
    const keys = [`username:${username}`];
    const normalizedIp = ipAddress.trim();

    if (normalizedIp.length > 0) {
      keys.push(`ip:${normalizedIp}`);
    }

    return keys;
  }

  private readPositiveIntEnv(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number.parseInt(raw ?? '', 10);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }

  private normalizeEmail(value?: string | null): string | null {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : null;
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
