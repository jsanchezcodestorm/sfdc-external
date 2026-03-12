import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { extractRequestOrigin, readAllowedFrontendOrigins } from '../common/utils/frontend-origins';

type RequestLike = Pick<Request, 'headers' | 'protocol' | 'get'>;

@Injectable()
export class AuthPublicOriginService {
  constructor(private readonly configService: ConfigService) {}

  resolveAllowedOrigin(request: RequestLike): string | null {
    const allowedOrigins = new Set(readAllowedFrontendOrigins(this.configService));
    const candidates = [
      extractRequestOrigin(
        this.readHeaderValue(request.headers.origin),
        this.readHeaderValue(request.headers.referer)
      ),
      this.buildOrigin(
        this.readForwardedProto(request),
        this.readForwardedHost(request)
      ),
      this.buildOrigin(
        this.readForwardedProto(request) ?? this.readProtocol(request),
        this.readHost(request)
      )
    ];

    for (const candidate of candidates) {
      if (candidate && allowedOrigins.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  buildOidcCallbackUri(publicOrigin: string, providerId: string): string {
    const url = new URL(`/api/auth/oidc/${encodeURIComponent(providerId)}/callback`, `${publicOrigin}/`);
    return url.toString().replace(/\/$/, '');
  }

  private readProtocol(request: RequestLike): string | null {
    const normalized = request.protocol?.trim().toLowerCase();
    return normalized === 'http' || normalized === 'https' ? normalized : null;
  }

  private readHost(request: RequestLike): string | null {
    return this.readHeaderValue(request.get?.('host') ?? request.headers.host) ?? null;
  }

  private readForwardedProto(request: RequestLike): string | null {
    const normalized = this.readHeaderValue(request.headers['x-forwarded-proto'])?.toLowerCase();
    return normalized === 'http' || normalized === 'https' ? normalized : null;
  }

  private readForwardedHost(request: RequestLike): string | null {
    return this.readHeaderValue(request.headers['x-forwarded-host']) ?? null;
  }

  private readHeaderValue(value: string | string[] | undefined): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    const normalized = raw?.split(',')[0]?.trim();
    return normalized && normalized.length > 0 ? normalized : undefined;
  }

  private buildOrigin(protocol: string | null, host: string | null): string | null {
    if (!protocol || !host) {
      return null;
    }

    try {
      const url = new URL(`${protocol}://${host}`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }

      return url.origin;
    } catch {
      return null;
    }
  }
}
