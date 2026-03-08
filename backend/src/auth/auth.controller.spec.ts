import assert from 'node:assert/strict';
import test from 'node:test';

import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from '../app.constants';

import { AuthController } from './auth.controller';
import { CsrfService } from './csrf.service';
import type { SessionUser } from './session-user.interface';

const USER: SessionUser = {
  sub: '003000000000001AAA',
  email: 'user@example.com',
  permissions: ['PORTAL_USER'],
  contactRecordTypeDeveloperName: 'Customer',
};

type MockResponse = {
  cookieCalls: Array<{ name: string; value: string; options: unknown }>;
  clearCookieCalls: Array<{ name: string; options: unknown }>;
  cookie(name: string, value: string, options: unknown): void;
  clearCookie(name: string, options: unknown): void;
};

function createResponse(): MockResponse {
  return {
    cookieCalls: [],
    clearCookieCalls: [],
    cookie(name: string, value: string, options: unknown) {
      this.cookieCalls.push({ name, value, options });
    },
    clearCookie(name: string, options: unknown) {
      this.clearCookieCalls.push({ name, options });
    },
  };
}

function createController() {
  const state = {
    setUsers: [] as SessionUser[],
    securityEvents: [] as Array<Record<string, unknown>>,
    bestEffortEvents: [] as Array<Record<string, unknown>>,
  };

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

  const authService = {
    async loginWithGoogleIdToken() {
      return {
        token: 'session-token',
        user: USER,
      };
    },
    getSessionCookieOptions() {
      return {
        httpOnly: true,
        path: '/',
      };
    },
    getClearCookieOptions() {
      return {
        httpOnly: true,
        maxAge: 0,
        path: '/',
      };
    },
  };

  const auditWriteService = {
    async recordSecurityEventOrThrow(input: Record<string, unknown>) {
      state.securityEvents.push(input);
    },
    async recordSecurityEventBestEffort(input: Record<string, unknown>) {
      state.bestEffortEvents.push(input);
    },
  };

  const requestContextService = {
    setUser(user: SessionUser) {
      state.setUsers.push(user);
    },
  };

  return {
    state,
    controller: new AuthController(
      authService as never,
      new CsrfService(configService as never),
      auditWriteService as never,
      requestContextService as never,
    ),
  };
}

test('getCsrfToken returns a token and sets the csrf cookie', () => {
  const { controller } = createController();
  const response = createResponse();

  const payload = controller.getCsrfToken(response as never);

  assert.equal(typeof payload.csrfToken, 'string');
  assert.equal(payload.csrfToken.length > 0, true);
  assert.equal(response.cookieCalls.length, 1);
  assert.equal(response.cookieCalls[0].name, CSRF_COOKIE_NAME);
  assert.equal(response.cookieCalls[0].value, payload.csrfToken);
});

test('getSession rotates the csrf cookie and returns the token', () => {
  const { controller } = createController();
  const response = createResponse();

  const payload = controller.getSession(USER, response as never);

  assert.deepEqual(payload.user, USER);
  assert.equal(typeof payload.csrfToken, 'string');
  assert.equal(response.cookieCalls.length, 1);
  assert.equal(response.cookieCalls[0].name, CSRF_COOKIE_NAME);
  assert.equal(response.cookieCalls[0].value, payload.csrfToken);
});

test('loginWithGoogle returns user and csrfToken while setting session and csrf cookies', async () => {
  const { controller, state } = createController();
  const response = createResponse();

  const payload = await controller.loginWithGoogle(
    { idToken: 'google-id-token' },
    response as never,
  );

  assert.deepEqual(payload.user, USER);
  assert.equal(typeof payload.csrfToken, 'string');
  assert.deepEqual(state.setUsers, [USER]);
  assert.equal(state.securityEvents.length, 1);
  assert.equal(state.securityEvents[0].reasonCode, 'GOOGLE_LOGIN_SUCCESS');
  assert.equal(response.cookieCalls.length, 2);
  assert.equal(
    response.cookieCalls.some((call) => call.name === SESSION_COOKIE_NAME),
    true,
  );
  assert.equal(
    response.cookieCalls.some(
      (call) => call.name === CSRF_COOKIE_NAME && call.value === payload.csrfToken,
    ),
    true,
  );
});

test('logout clears session and csrf cookies', () => {
  const { controller, state } = createController();
  const response = createResponse();

  const payload = controller.logout(response as never);

  assert.deepEqual(payload, { success: true });
  assert.equal(response.clearCookieCalls.length, 2);
  assert.equal(
    response.clearCookieCalls.some((call) => call.name === SESSION_COOKIE_NAME),
    true,
  );
  assert.equal(
    response.clearCookieCalls.some((call) => call.name === CSRF_COOKIE_NAME),
    true,
  );
  assert.equal(state.bestEffortEvents.length, 1);
  assert.equal(state.bestEffortEvents[0].reasonCode, 'LOGOUT');
});
