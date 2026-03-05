import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { sign, verify, type JwtPayload } from 'jsonwebtoken';

import { AclService } from '../acl/acl.service';

import type { SessionUser } from './session-user.interface';

interface SessionTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  permissions: string[];
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly jwtSecret: string;
  private readonly jwtExpiresInSeconds: number;
  private readonly adminFallbackEmail: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly aclService: AclService
  ) {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '');
    this.googleClient = new OAuth2Client(googleClientId || undefined);

    this.jwtSecret = this.configService.get<string>('JWT_SECRET', 'change-me-in-production');
    this.jwtExpiresInSeconds = this.readPositiveIntEnv('JWT_EXPIRES_IN_SECONDS', 3600);
    this.adminFallbackEmail = this.readNormalizedEmailEnv('ADMIN_FALLBACK_EMAIL');
  }

  async loginWithGoogleIdToken(idToken: string): Promise<{ token: string; user: SessionUser }> {
    const payload = await this.verifyGoogleIdToken(idToken);

    const user: SessionUser = {
      sub: payload.sub ?? '',
      email: payload.email ?? '',
      permissions: this.resolveInitialPermissions(payload)
    };

    if (!user.sub || !user.email) {
      throw new UnauthorizedException('Google token missing required claims');
    }

    const token = this.signSessionToken(user);
    return { token, user };
  }

  verifySessionToken(token: string): SessionUser {
    try {
      const decoded = verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as SessionTokenPayload | string;

      if (typeof decoded === 'string') {
        throw new UnauthorizedException('Invalid session payload');
      }

      return {
        sub: decoded.sub,
        email: decoded.email,
        permissions: decoded.permissions ?? []
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

  private signSessionToken(user: SessionUser): string {
    return sign(
      {
        sub: user.sub,
        email: user.email,
        permissions: user.permissions
      },
      this.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.jwtExpiresInSeconds
      }
    );
  }

  private resolveInitialPermissions(payload: TokenPayload): string[] {
    const permissions = new Set<string>(this.aclService.getDefaultPermissions());
    const userEmail = this.normalizeEmail(payload.email);

    if (this.adminFallbackEmail && userEmail === this.adminFallbackEmail) {
      permissions.add('PORTAL_ADMIN');
    }

    return [...permissions];
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
}
