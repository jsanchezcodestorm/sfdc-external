import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME } from '../app.constants';

import type { SessionUser } from '../auth/session-user.interface';

import type { RequestContextState } from './audit.types';

@Injectable()
export class RequestContextService {
  private static readonly storage = new AsyncLocalStorage<RequestContextState>();

  run(req: Request, res: Response, next: NextFunction): void {
    const requestId = this.normalizeRequestId(req.header('x-request-id')) ?? randomUUID();
    const context: RequestContextState = {
      requestId,
      endpoint: req.path || req.originalUrl || '/',
      httpMethod: req.method.toUpperCase(),
      ip: req.ip || '',
      userAgent: req.header('user-agent')?.trim() ?? '',
      sessionToken: this.resolveSessionToken(req),
    };

    res.setHeader('X-Request-Id', requestId);
    RequestContextService.storage.run(context, next);
  }

  get(): RequestContextState | undefined {
    return RequestContextService.storage.getStore();
  }

  getRequestId(): string {
    return this.get()?.requestId ?? randomUUID();
  }

  setUser(user: SessionUser): void {
    const context = this.get();
    if (!context) {
      return;
    }

    context.userContactId = user.sub;
  }

  static getSessionToken(): string | undefined {
    return RequestContextService.storage.getStore()?.sessionToken;
  }

  setSessionToken(token: string | undefined): void {
    const context = this.get();
    if (!context) {
      return;
    }

    context.sessionToken = token;
  }

  private normalizeRequestId(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    if (!normalized) {
      return undefined;
    }

    return normalized.slice(0, 64);
  }

  private resolveSessionToken(request: Request): string | undefined {
    const cookies = this.parseCookieHeader(request.headers?.cookie);
    const fromCookie = this.normalizeTokenValue(cookies[SESSION_COOKIE_NAME]);
    if (fromCookie) {
      return fromCookie;
    }

    return this.normalizeTokenValue(request.headers?.authorization);
  }

  private normalizeTokenValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }

    if (normalized.toLowerCase().startsWith('bearer ')) {
      const bearerToken = normalized.slice('bearer '.length).trim();
      return bearerToken || undefined;
    }

    return normalized;
  }

  private parseCookieHeader(headerValue?: string): Record<string, string> {
    if (!headerValue) {
      return {};
    }

    return headerValue
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((accumulator, entry) => {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex === -1) {
          return accumulator;
        }

        const key = entry.slice(0, separatorIndex).trim();
        const value = entry.slice(separatorIndex + 1).trim();
        if (key) {
          accumulator[key] = decodeURIComponent(value);
        }

        return accumulator;
      }, {});
  }
}
