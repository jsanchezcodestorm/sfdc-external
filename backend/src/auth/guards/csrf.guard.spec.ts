import assert from 'node:assert/strict';
import test from 'node:test';

import { ForbiddenException, type ExecutionContext } from '@nestjs/common';

import { CsrfService } from '../csrf.service';

import { CsrfGuard } from './csrf.guard';

function createGuard() {
  const auditCalls: Array<Record<string, unknown>> = [];
  const configService = {
    get(key: string, fallback?: string) {
      const values: Record<string, string> = {
        FRONTEND_ORIGINS: 'http://localhost:5173',
        JWT_EXPIRES_IN_SECONDS: '3600',
        NODE_ENV: 'development',
      };

      return values[key] ?? fallback;
    },
  };

  const auditWriteService = {
    async recordSecurityEventOrThrow(input: Record<string, unknown>) {
      auditCalls.push(input);
    },
  };

  return {
    auditCalls,
    guard: new CsrfGuard(
      new CsrfService(configService as never),
      auditWriteService as never,
    ),
  };
}

function createRequest(options?: {
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}) {
  const headers = Object.fromEntries(
    Object.entries(options?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    method: options?.method ?? 'POST',
    cookies: options?.cookies ?? {},
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

function createContext(request: ReturnType<typeof createRequest>): ExecutionContext {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return request;
        },
      };
    },
  } as ExecutionContext;
}

test('allows safe methods without CSRF validation', async () => {
  const { guard, auditCalls } = createGuard();
  const request = createRequest({ method: 'GET' });

  const result = await guard.canActivate(createContext(request));

  assert.equal(result, true);
  assert.deepEqual(auditCalls, []);
});

test('allows mutating requests with allowed origin and matching tokens', async () => {
  const { guard, auditCalls } = createGuard();
  const request = createRequest({
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json; charset=utf-8',
      'X-CSRF-Token': 'csrf-token',
    },
    cookies: {
      csrf: 'csrf-token',
    },
  });

  const result = await guard.canActivate(createContext(request));

  assert.equal(result, true);
  assert.deepEqual(auditCalls, []);
});

test('allows referer fallback when origin is absent', async () => {
  const { guard, auditCalls } = createGuard();
  const request = createRequest({
    method: 'DELETE',
    headers: {
      Referer: 'http://localhost:5173/admin/apps',
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'csrf-token',
    },
    cookies: {
      csrf: 'csrf-token',
    },
  });

  const result = await guard.canActivate(createContext(request));

  assert.equal(result, true);
  assert.deepEqual(auditCalls, []);
});

test('denies missing or mismatched tokens with CSRF_VALIDATION_FAILED', async () => {
  const { guard, auditCalls } = createGuard();
  const request = createRequest({
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'header-token',
    },
    cookies: {
      csrf: 'cookie-token',
    },
  });

  await assert.rejects(
    () => guard.canActivate(createContext(request)),
    (error: unknown) =>
      error instanceof ForbiddenException && error.message === 'Invalid CSRF token',
  );

  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].reasonCode, 'CSRF_VALIDATION_FAILED');
  assert.equal(auditCalls[0].eventType, 'CSRF');
});

test('denies disallowed origins with ORIGIN_NOT_ALLOWED', async () => {
  const { guard, auditCalls } = createGuard();
  const request = createRequest({
    method: 'PUT',
    headers: {
      Origin: 'http://evil.example',
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'csrf-token',
    },
    cookies: {
      csrf: 'csrf-token',
    },
  });

  await assert.rejects(
    () => guard.canActivate(createContext(request)),
    (error: unknown) =>
      error instanceof ForbiddenException && error.message === 'Request origin is not allowed',
  );

  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].reasonCode, 'ORIGIN_NOT_ALLOWED');
  assert.equal(auditCalls[0].eventType, 'CSRF');
});

test('denies unsafe non-json content types', async () => {
  const { guard, auditCalls } = createGuard();
  const request = createRequest({
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
      'Content-Type': 'text/plain',
      'X-CSRF-Token': 'csrf-token',
    },
    cookies: {
      csrf: 'csrf-token',
    },
  });

  await assert.rejects(
    () => guard.canActivate(createContext(request)),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === 'Mutating requests must use application/json content type',
  );

  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].reasonCode, 'CSRF_VALIDATION_FAILED');
  assert.equal(auditCalls[0].eventType, 'CSRF');
});
