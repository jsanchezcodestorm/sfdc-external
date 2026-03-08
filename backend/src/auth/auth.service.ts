import { Inject, Injectable, UnauthorizedException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { sign, verify, type JwtPayload } from 'jsonwebtoken';

import { AclContactPermissionsRepository } from '../acl/acl-contact-permissions.repository';
import { AclService } from '../acl/acl.service';
import { SalesforceService } from '../salesforce/salesforce.service';

import type { SessionUser } from './session-user.interface';

interface SessionTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  permissions: string[];
  contactRecordTypeDeveloperName?: string;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly jwtSecret: string;
  private readonly jwtExpiresInSeconds: number;
  private readonly adminFallbackEmail: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly aclService: AclService,
    private readonly aclContactPermissionsRepository: AclContactPermissionsRepository,
    @Inject(forwardRef(() => SalesforceService))
    private readonly salesforceService: SalesforceService
  ) {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '');
    this.googleClient = new OAuth2Client(googleClientId || undefined);

    this.jwtSecret = this.configService.get<string>('JWT_SECRET', 'change-me-in-production');
    this.jwtExpiresInSeconds = this.readPositiveIntEnv('JWT_EXPIRES_IN_SECONDS', 3600);
    this.adminFallbackEmail = this.readNormalizedEmailEnv('ADMIN_FALLBACK_EMAIL');
  }

  async loginWithGoogleIdToken(idToken: string): Promise<{ token: string; user: SessionUser }> {
    const payload = await this.verifyGoogleIdToken(idToken);
    const contact = await this.resolveSalesforceContact(payload.email ?? '');

    const user: SessionUser = {
      sub: contact.id,
      email: payload.email ?? '',
      permissions: await this.resolveEffectivePermissions(contact.id, payload.email ?? ''),
      contactRecordTypeDeveloperName: contact.recordTypeDeveloperName
    };

    if (!user.sub || !user.email) {
      throw new UnauthorizedException('Google token missing required claims');
    }

    const token = this.issueSessionToken(user);
    return { token, user };
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
    const options = this.getSessionCookieOptions();
    return {
      ...options,
      maxAge: 0
    };
  }

  private async verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    if (!googleClientId) {
      throw new UnauthorizedException('GOOGLE_CLIENT_ID is not configured');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: googleClientId
      });

      const payload = ticket.getPayload();

      if (!payload?.email || !payload.email_verified) {
        throw new UnauthorizedException('Google account email is not verified');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid Google id token');
    }
  }

  issueSessionToken(user: SessionUser): string {
    return sign(
      {
        sub: user.sub,
        email: user.email,
        permissions: user.permissions,
        contactRecordTypeDeveloperName: user.contactRecordTypeDeveloperName
      },
      this.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.jwtExpiresInSeconds
      }
    );
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

    return decoded;
  }

  private mapSessionUserFromPayload(decoded: SessionTokenPayload): SessionUser {
    return {
      sub: decoded.sub,
      email: decoded.email,
      permissions: this.aclService.normalizePermissions(decoded.permissions),
      contactRecordTypeDeveloperName: decoded.contactRecordTypeDeveloperName
    };
  }

  private async resolveEffectivePermissions(contactId: string, email: string): Promise<string[]> {
    const permissions = [
      ...this.aclService.getDefaultPermissions(),
      ...(await this.aclContactPermissionsRepository.listPermissionCodesByContactId(contactId))
    ];
    const userEmail = this.normalizeEmail(email);

    if (this.adminFallbackEmail && userEmail === this.adminFallbackEmail) {
      permissions.push('PORTAL_ADMIN');
    }

    return this.aclService.normalizePermissions(permissions);
  }

  private async resolveSalesforceContact(
    email: string,
  ): Promise<{ id: string; recordTypeDeveloperName?: string }> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new UnauthorizedException('Google token missing verified email');
    }

    const contact = await this.salesforceService.findContactByEmail(normalizedEmail);
    if (!contact) {
      throw new UnauthorizedException('No Salesforce Contact mapped to this Google account');
    }

    return {
      id: contact.id,
      recordTypeDeveloperName: contact.recordTypeDeveloperName,
    };
  }

  private readPositiveIntEnv(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number.parseInt(raw ?? '', 10);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }

  private readNormalizedEmailEnv(key: string): string | null {
    return this.normalizeEmail(this.configService.get<string>(key));
  }

  private normalizeEmail(value?: string): string | null {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : null;
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
