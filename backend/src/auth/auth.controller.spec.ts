import assert from 'node:assert/strict';
import test from 'node:test';

import { CSRF_COOKIE_NAME, OIDC_FLOW_COOKIE_NAME, SESSION_COOKIE_NAME } from '../app.constants';

import { AuthController } from './auth.controller';
import { CsrfService } from './csrf.service';
import type { SessionUser } from './session-user.interface';

const USER: SessionUser = {
  sub: '003000000000001AAA',
  email: 'user@example.com',
  permissions: ['PORTAL_USER'],
  contactRecordTypeDeveloperName: 'Customer',
  authProvider: 'local',
  authMethod: 'local',
};

const REFRESHED_USER: SessionUser = {
  ...USER,
  permissions: ['PORTAL_USER', 'ACCOUNT_WRITE'],
};

type MockResponse = {
  cookieCalls: Array<{ name: string; value: string; options: unknown }>;
  clearCookieCalls: Array<{ name: string; options: unknown }>;
  redirectCalls: string[];
  cookie(name: string, value: string, options: unknown): void;
  clearCookie(name: string, options: unknown): void;
  redirect(url: string): void;
};

function createResponse(): MockResponse {
  return {
    cookieCalls: [],
    clearCookieCalls: [],
    redirectCalls: [],
    cookie(name: string, value: string, options: unknown) {
      this.cookieCalls.push({ name, value, options });
    },
    clearCookie(name: string, options: unknown) {
      this.clearCookieCalls.push({ name, options });
    },
    redirect(url: string) {
      this.redirectCalls.push(url);
    },
  };
}

function createController() {
  const state = {
    setUsers: [] as SessionUser[],
    securityEvents: [] as Array<Record<string, unknown>>,
    bestEffortEvents: [] as Array<Record<string, unknown>>,
    refreshedSessionTokens: [] as string[],
    issuedSessionUsers: [] as SessionUser[],
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
    async listPublicProviders() {
      return {
        items: [
          { id: 'google', type: 'oidc', label: 'Google', loginPath: '/api/auth/oidc/google/start' },
          { id: 'local', type: 'local', label: 'Username e password' },
        ],
      };
    },
    async createOidcLoginStart() {
      return {
        redirectUrl: 'https://accounts.example/authorize',
        flowToken: 'oidc-flow-token',
      };
    },
    async completeOidcLogin() {
      return {
        token: 'session-token',
        user: USER,
      };
    },
    async loginWithPassword() {
      return {
        token: 'session-token',
        user: USER,
      };
    },
    async refreshSessionUser(token: string) {
      state.refreshedSessionTokens.push(token);
      return REFRESHED_USER;
    },
    issueSessionToken(user: SessionUser) {
      state.issuedSessionUsers.push(user);
      return 'rotated-session-token';
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
    getOidcFlowCookieOptions() {
      return {
        httpOnly: true,
        path: '/api/auth/oidc/google',
      };
    },
    getClearOidcFlowCookieOptions() {
      return {
        httpOnly: true,
        maxAge: 0,
        path: '/api/auth/oidc/google',
      };
    },
    getFrontendLoginRedirect() {
      return 'http://localhost:5173/#/login';
    },
  };

  const authProviderAdminService = {
    async listProviders() {
      return {
        items: [],
      };
    },
    async getProvider() {
      return {
        provider: {
          id: 'google',
          providerFamily: 'google',
          type: 'oidc',
          label: 'Google',
          enabled: true,
          sortOrder: 0,
          isConfigured: true,
          isRuntimeAvailable: true,
          hasClientSecret: true,
          status: 'active',
          issuer: 'https://accounts.google.com',
          clientId: 'client-id',
          callbackUri: 'http://localhost:5173/api/auth/oidc/google/callback',
          scopes: ['openid', 'email', 'profile'],
        },
      };
    },
    async updateProvider() {
      return {
        provider: {
          id: 'google',
          providerFamily: 'google',
          type: 'oidc',
          label: 'Google',
          enabled: true,
          sortOrder: 0,
          isConfigured: true,
          isRuntimeAvailable: true,
          hasClientSecret: true,
          status: 'active',
        },
      };
    },
  };

  const localCredentialAdminService = {
    async listCredentials() {
      return {
        items: [],
      };
    },
    async upsertCredential() {
      return {
        credential: {
          contactId: USER.sub,
          username: USER.email,
          enabled: true,
          failedAttempts: 0,
          updatedAt: new Date().toISOString(),
        },
      };
    },
    async deleteCredential() {},
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
      authProviderAdminService as never,
      localCredentialAdminService as never,
      new CsrfService(configService as never),
      auditWriteService as never,
      requestContextService as never,
    ),
  };
}

test('listProviders returns the public provider catalog', async () => {
  const { controller } = createController();

  const payload = await controller.listProviders();

  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].id, 'google');
  assert.equal(payload.items[1].id, 'local');
});

test('getAdminProvider returns the non-sensitive provider detail', async () => {
  const { controller } = createController();

  const payload = await controller.getAdminProvider(
    'google',
    {
      headers: {
        origin: 'http://localhost:5173',
      },
      protocol: 'http',
      get() {
        return 'localhost:5173';
      },
    } as never,
  );

  assert.equal(payload.provider.id, 'google');
  assert.equal(payload.provider.providerFamily, 'google');
  assert.equal(payload.provider.hasClientSecret, true);
  assert.equal(payload.provider.clientId, 'client-id');
});

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

test('startOidcLogin sets the flow cookie and redirects to the provider', async () => {
  const { controller } = createController();
  const response = createResponse();

  await controller.startOidcLogin(
    'google',
    {
      headers: {
        referer: 'http://localhost:5173/login',
      },
      protocol: 'http',
      get() {
        return 'localhost:5173';
      },
    } as never,
    response as never,
  );

  assert.equal(response.cookieCalls.length, 1);
  assert.equal(response.cookieCalls[0].name, OIDC_FLOW_COOKIE_NAME);
  assert.equal(response.cookieCalls[0].value, 'oidc-flow-token');
  assert.deepEqual(response.redirectCalls, ['https://accounts.example/authorize']);
});

test('loginWithPassword returns user and csrfToken while setting session and csrf cookies', async () => {
  const { controller, state } = createController();
  const response = createResponse();

  const payload = await controller.loginWithPassword(
    { username: 'user@example.com', password: 'Password!123' },
    { ip: '127.0.0.1' } as never,
    response as never,
  );

  assert.deepEqual(payload.user, USER);
  assert.equal(typeof payload.csrfToken, 'string');
  assert.deepEqual(state.setUsers, [USER]);
  assert.equal(state.securityEvents.length, 1);
  assert.equal(state.securityEvents[0].reasonCode, 'LOGIN_SUCCESS');
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

test('getSession refreshes the user, rotates the session and csrf cookies, and returns the token', async () => {
  const { controller, state } = createController();
  const response = createResponse();
  const request = {
    cookies: {
      [SESSION_COOKIE_NAME]: 'existing-session-token',
    },
    user: USER,
  };

  const payload = await controller.getSession(request as never, response as never);

  assert.deepEqual(payload.user, REFRESHED_USER);
  assert.equal(typeof payload.csrfToken, 'string');
  assert.deepEqual(state.refreshedSessionTokens, ['existing-session-token']);
  assert.deepEqual(state.issuedSessionUsers, [REFRESHED_USER]);
  assert.deepEqual(state.setUsers, [REFRESHED_USER]);
  assert.deepEqual(request.user, REFRESHED_USER);
  assert.equal(response.cookieCalls.length, 2);
  assert.equal(response.cookieCalls[0].name, SESSION_COOKIE_NAME);
  assert.equal(response.cookieCalls[0].value, 'rotated-session-token');
  assert.equal(response.cookieCalls[1].name, CSRF_COOKIE_NAME);
  assert.equal(response.cookieCalls[1].value, payload.csrfToken);
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
