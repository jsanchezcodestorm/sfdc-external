import { randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../app.constants';
import { extractRequestOrigin, readAllowedFrontendOrigins } from '../common/utils/frontend-origins';

export interface CsrfRequest {
  method: string;
  cookies?: Record<string, string>;
  header(name: string): string | undefined;
}

export interface CsrfValidationFailure {
  message: string;
  reasonCode: 'CSRF_VALIDATION_FAILED' | 'ORIGIN_NOT_ALLOWED';
  metadata: Record<string, unknown>;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfService {
  private readonly allowedOrigins: string[];
  private readonly isProd: boolean;
  private readonly maxAge: number;

  constructor(private readonly configService: ConfigService) {
    this.allowedOrigins = readAllowedFrontendOrigins(this.configService);
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
    this.maxAge = this.readPositiveIntEnv('JWT_EXPIRES_IN_SECONDS', 3600) * 1000;
  }

  issueToken(response: Response): string {
    const csrfToken = randomBytes(32).toString('base64url');
    response.cookie(CSRF_COOKIE_NAME, csrfToken, this.getCookieOptions());
    return csrfToken;
  }

  clearToken(response: Response): void {
    response.clearCookie(CSRF_COOKIE_NAME, this.getClearCookieOptions());
  }

  validateRequest(request: CsrfRequest): CsrfValidationFailure | null {
    if (this.isSafeMethod(request.method)) {
      return null;
    }

    const origin = request.header('origin');
    const referer = request.header('referer');
    const requestOrigin = extractRequestOrigin(origin, referer);

    if (!requestOrigin || !this.allowedOrigins.includes(requestOrigin)) {
      return {
        message: 'Request origin is not allowed',
        reasonCode: 'ORIGIN_NOT_ALLOWED',
        metadata: {
          origin: origin ?? null,
          referer: referer ?? null,
          requestOrigin
        }
      };
    }

    const contentType = request.header('content-type')?.trim().toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return {
        message: 'Mutating requests must use application/json content type',
        reasonCode: 'CSRF_VALIDATION_FAILED',
        metadata: {
          contentType: contentType || null
        }
      };
    }

    const cookieToken = request.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.header(CSRF_HEADER_NAME)?.trim();
    if (!cookieToken || !headerToken || !this.tokensMatch(cookieToken, headerToken)) {
      return {
        message: 'Invalid CSRF token',
        reasonCode: 'CSRF_VALIDATION_FAILED',
        metadata: {
          hasCookieToken: Boolean(cookieToken),
          hasHeaderToken: Boolean(headerToken)
        }
      };
    }

    return null;
  }

  isSafeMethod(method: string): boolean {
    return SAFE_METHODS.has(method.trim().toUpperCase());
  }

  private getCookieOptions(): CookieOptions {
    return {
      httpOnly: false,
      secure: this.isProd,
      sameSite: this.isProd ? 'strict' : 'lax',
      maxAge: this.maxAge,
      path: '/'
    };
  }

  private getClearCookieOptions(): CookieOptions {
    return {
      ...this.getCookieOptions(),
      maxAge: 0
    };
  }

  private tokensMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private readPositiveIntEnv(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number.parseInt(raw ?? '', 10);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }
}
