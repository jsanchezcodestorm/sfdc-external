import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import type { SessionUser } from '../auth/session-user.interface';

import type { RequestContextState } from './audit.types';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextState>();

  run(req: Request, res: Response, next: NextFunction): void {
    const requestId = this.normalizeRequestId(req.header('x-request-id')) ?? randomUUID();
    const context: RequestContextState = {
      requestId,
      endpoint: req.path || req.originalUrl || '/',
      httpMethod: req.method.toUpperCase(),
      ip: req.ip || '',
      userAgent: req.header('user-agent')?.trim() ?? '',
    };

    res.setHeader('X-Request-Id', requestId);
    this.storage.run(context, next);
  }

  get(): RequestContextState | undefined {
    return this.storage.getStore();
  }

  getRequestId(): string {
    return this.storage.getStore()?.requestId ?? randomUUID();
  }

  setUser(user: SessionUser): void {
    const context = this.storage.getStore();
    if (!context) {
      return;
    }

    context.userContactId = user.sub;
  }

  private normalizeRequestId(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    if (!normalized) {
      return undefined;
    }

    return normalized.slice(0, 64);
  }
}
