import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request } from 'express';

import { AclContactPermissionsRepository } from '../acl/acl-contact-permissions.repository';
import { AclService } from '../acl/acl.service';
import { platformAuthJson } from '../platform/platform-clients';
import { SalesforceService } from '../salesforce/salesforce.service';
import { SetupService } from '../setup/setup.service';

import { AuthPublicOriginService } from './auth-public-origin.service';
import type { AuthProvidersResponse } from './auth.types';
import type { SessionUser } from './session-user.interface';

type PlatformMembership = {
  productCode: string;
  subjectId: string;
  tenantId?: string;
  role?: string;
  attributes?: Record<string, unknown>;
};

type PlatformSessionUser = {
  id: string;
  email: string;
  authProvider?: string;
  authMethod?: 'oidc' | 'local';
  memberships?: PlatformMembership[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly aclService: AclService,
    private readonly aclContactPermissionsRepository: AclContactPermissionsRepository,
    private readonly authPublicOriginService: AuthPublicOriginService,
    private readonly setupService: SetupService,
    private readonly salesforceService: SalesforceService
  ) {}

  listPublicProviders(): Promise<AuthProvidersResponse> {
    return platformAuthJson<AuthProvidersResponse>('/auth/providers');
  }

  async createOidcLoginStart(
    providerId: string,
    request: Pick<Request, 'headers' | 'protocol' | 'get'>
  ): Promise<{ redirectUrl: string }> {
    const publicOrigin =
      this.authPublicOriginService.resolveAllowedOrigin(request) ?? this.getDefaultFrontendOrigin();

    return {
      redirectUrl: `${this.getPlatformAuthBaseUrl()}/auth/oidc/${encodeURIComponent(
        providerId
      )}/start?${new URLSearchParams({
        productCode: 'sfdc-external',
        returnTo: this.getFrontendLoginRedirect(undefined, publicOrigin)
      }).toString()}`
    };
  }

  buildOidcCallbackProxyUrl(
    providerId: string,
    query: Record<string, string | undefined>
  ): string {
    const target = new URL(
      `${this.getPlatformAuthBaseUrl()}/auth/oidc/${encodeURIComponent(providerId)}/callback`
    );

    for (const [key, value] of Object.entries(query)) {
      if (value && value.trim().length > 0) {
        target.searchParams.set(key, value);
      }
    }

    return target.toString();
  }

  async loginWithPassword(
    username: string,
    password: string
  ): Promise<{ token: string; user: SessionUser }> {
    const payload = await platformAuthJson<{ user: PlatformSessionUser; accessToken: string }>(
      '/auth/login/password',
      {
        method: 'POST',
        body: {
          username,
          password,
          productCode: 'sfdc-external'
        }
      }
    );

    return {
      token: payload.accessToken,
      user: await this.mapPlatformUserToSessionUser(payload.user)
    };
  }

  async verifySessionToken(token: string): Promise<SessionUser> {
    try {
      const payload = await platformAuthJson<{ user: PlatformSessionUser }>('/internal/session/resolve', {
        method: 'POST',
        body: {
          token,
          productCode: 'sfdc-external'
        }
      });

      return this.mapPlatformUserToSessionUser(payload.user);
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  async refreshSessionUser(token: string): Promise<SessionUser> {
    return this.verifySessionToken(token);
  }

  getSessionCookieOptions(): CookieOptions {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const cookieDomain =
      this.configService.get<string>('SESSION_COOKIE_DOMAIN') ??
      this.configService.get<string>('PLATFORM_AUTH_COOKIE_DOMAIN') ??
      '.cs.lvh.me';

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
      domain: cookieDomain
    };
  }

  getClearCookieOptions(): CookieOptions {
    return {
      ...this.getSessionCookieOptions(),
      maxAge: 0
    };
  }

  getFrontendLoginRedirect(
    search?: Record<string, string | undefined>,
    originOverride?: string
  ): string {
    const frontendOrigin = originOverride ?? this.getDefaultFrontendOrigin();
    const url = new URL('/', frontendOrigin);
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(search ?? {})) {
      if (value?.trim()) {
        searchParams.set(key, value.trim());
      }
    }

    url.hash = searchParams.size > 0 ? `/login?${searchParams.toString()}` : '/login';
    return url.toString();
  }

  private async mapPlatformUserToSessionUser(user: PlatformSessionUser): Promise<SessionUser> {
    const membership = (user.memberships ?? []).find(
      (entry) => entry.productCode === 'sfdc-external'
    );

    if (!membership) {
      throw new UnauthorizedException('No active membership available for sfdc-external');
    }

    const subjectId = membership.subjectId;
    const contact = await this.salesforceService.findContactById(subjectId).catch(() => null);
    const resolvedEmail = this.normalizeEmail(contact?.email) ?? this.normalizeEmail(user.email);

    if (!resolvedEmail) {
      throw new UnauthorizedException('Membership is missing a valid email');
    }

    const membershipRecordType = this.readOptionalString(
      membership.attributes?.contactRecordTypeDeveloperName
    );

    return {
      sub: subjectId,
      identityId: user.id,
      email: resolvedEmail,
      permissions: await this.resolveEffectivePermissions(subjectId, resolvedEmail),
      contactRecordTypeDeveloperName:
        contact?.recordTypeDeveloperName ?? membershipRecordType ?? undefined,
      authProvider: user.authProvider,
      authMethod: user.authMethod
    };
  }

  private async resolveEffectivePermissions(contactId: string, email: string): Promise<string[]> {
    const permissions = [
      ...this.aclService.getDefaultPermissions(),
      ...(await this.aclContactPermissionsRepository.listPermissionCodesByContactId(contactId))
    ];
    const userEmail = this.normalizeEmail(email);
    const bootstrapAdminEmail = this.normalizeEmail(await this.setupService.getCompletedAdminEmail());

    if (bootstrapAdminEmail && userEmail === bootstrapAdminEmail) {
      permissions.push('PORTAL_ADMIN');
    }

    return this.aclService.normalizePermissions(permissions);
  }

  private getPlatformAuthBaseUrl(): string {
    return (
      this.configService.get<string>('PLATFORM_AUTH_SERVICE_URL') ?? 'http://localhost:3100'
    ).replace(/\/+$/, '');
  }

  private getDefaultFrontendOrigin(): string {
    return (
      this.configService.get<string>('FRONTEND_ORIGINS', 'http://localhost:5173')
        .split(',')
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0) ?? 'http://localhost:5173'
    );
  }

  private normalizeEmail(value?: string | null): string | null {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : null;
  }

  private readOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}
