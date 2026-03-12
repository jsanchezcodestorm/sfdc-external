import assert from 'node:assert/strict';
import test from 'node:test';

import { verify } from 'jsonwebtoken';

import { AuthService } from './auth.service';

const CONTACT_ID = '003000000000001AAA';
const VALID_PASSWORD = 'Password!123';

async function createAuthService(options?: {
  defaultPermissions?: string[];
  explicitPermissions?: string[];
  bootstrapAdminEmail?: string;
  contactEmail?: string;
}) {
  const state = {
    explicitPermissions: options?.explicitPermissions ?? ['ACCOUNT_READ'],
    permissionReads: 0,
  };
  const passwordHash = 'password-hash';

  const configService = {
    get(key: string, fallback?: string) {
      const values: Record<string, string> = {
        JWT_SECRET: 'jwt-secret',
        JWT_EXPIRES_IN_SECONDS: '3600',
        LOCAL_AUTH_LOCKOUT_THRESHOLD: '5',
        LOCAL_AUTH_LOCKOUT_SECONDS: '900',
      };

      return values[key] ?? fallback;
    },
  };

  const aclService = {
    getDefaultPermissions() {
      return options?.defaultPermissions ?? ['PORTAL_USER'];
    },
    normalizePermissions(permissionCodes: string[]) {
      return [
        ...new Set(permissionCodes.map((permissionCode) => permissionCode.trim().toUpperCase())),
      ];
    },
  };

  const aclContactPermissionsRepository = {
    async listPermissionCodesByContactId() {
      state.permissionReads += 1;
      return [...state.explicitPermissions];
    },
  };

  const authProviderRegistryService = {
    async loadOidcDiscovery() {
      return {
        issuer: 'https://accounts.google.com',
        authorization_endpoint: 'https://accounts.example/authorize',
        token_endpoint: 'https://accounts.example/token',
        jwks_uri: 'https://accounts.example/jwks',
      };
    },
    async getOidcRuntimeProvider() {
      return {
        id: 'google',
        providerFamily: 'google',
        type: 'oidc',
        label: 'Google',
        envEnabled: true,
        defaultSortOrder: 0,
        isConfigured: true,
        isRuntimeAvailable: true,
        loginPath: '/api/auth/oidc/google/start',
        issuer: 'https://accounts.google.com',
        discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        scopes: ['openid', 'email', 'profile'],
      };
    },
    async verifyOidcIdToken() {
      return {
        email: (options?.contactEmail ?? 'user@example.com').toLowerCase(),
      };
    },
    getFrontendLoginUrl() {
      return '/#/login';
    },
  };

  const authProviderAdminService = {
    async getPublicProviders() {
      return {
        items: [
          { id: 'google', type: 'oidc', label: 'Google', loginPath: '/api/auth/oidc/google/start' },
          { id: 'local', type: 'local', label: 'Username e password' },
        ],
      };
    },
  };

  const authPublicOriginService = {
    resolveAllowedOrigin() {
      return 'http://localhost:5173';
    },
    buildOidcCallbackUri(origin: string, providerId: string) {
      return `${origin}/api/auth/oidc/${providerId}/callback`;
    },
  };

  const localCredentialPasswordService = {
    async verifyPassword(passwordHashToCheck: string, password: string) {
      return passwordHashToCheck === passwordHash && password === VALID_PASSWORD;
    },
  };

  const localCredentialRepository = {
    async findByUsername() {
      return {
        contactId: CONTACT_ID,
        username: (options?.contactEmail ?? 'user@example.com').toLowerCase(),
        passwordHash,
        enabled: true,
        failedAttempts: 0,
        lockedUntil: null,
      };
    },
    async recordFailedLogin() {},
    async recordSuccessfulLogin() {},
  };

  const localLoginRateLimiterService = {
    isAllowed() {
      return true;
    },
    recordFailure() {},
    reset() {},
  };

  const setupService = {
    async getCompletedAdminEmail() {
      return options?.bootstrapAdminEmail ?? null;
    },
  };

  const salesforceService = {
    async findContactById() {
      return {
        id: CONTACT_ID,
        email: options?.contactEmail ?? 'user@example.com',
        recordTypeDeveloperName: 'Customer',
      };
    },
    async findContactByEmail(email: string) {
      return {
        id: CONTACT_ID,
        email,
        recordTypeDeveloperName: 'Customer',
      };
    },
  };

  const service = new AuthService(
    configService as never,
    aclService as never,
    aclContactPermissionsRepository as never,
    authProviderRegistryService as never,
    authProviderAdminService as never,
    authPublicOriginService as never,
    localCredentialPasswordService as never,
    localCredentialRepository as never,
    localLoginRateLimiterService as never,
    setupService as never,
    salesforceService as never,
  );

  return { service, state };
}

test('loginWithPassword merges default, explicit, and setup bootstrap admin permissions', async () => {
  const { service, state } = await createAuthService({
    defaultPermissions: ['PORTAL_USER'],
    explicitPermissions: ['ACCOUNT_READ', 'PORTAL_USER'],
    bootstrapAdminEmail: 'admin@example.com',
    contactEmail: 'admin@example.com',
  });

  const response = await service.loginWithPassword('admin@example.com', VALID_PASSWORD, '127.0.0.1');

  assert.deepEqual(response.user.permissions, ['PORTAL_USER', 'ACCOUNT_READ', 'PORTAL_ADMIN']);
  assert.equal(response.user.contactRecordTypeDeveloperName, 'Customer');
  assert.equal(response.user.authProvider, 'local');
  assert.equal(response.user.authMethod, 'local');
  assert.equal(state.permissionReads, 1);
});

test('verifySessionToken trusts the JWT permission snapshot without rereading PostgreSQL', async () => {
  const { service, state } = await createAuthService({
    defaultPermissions: ['PORTAL_USER'],
    explicitPermissions: ['ACCOUNT_READ'],
    contactEmail: 'user@example.com',
  });

  const firstLogin = await service.loginWithPassword('user@example.com', VALID_PASSWORD, '127.0.0.1');
  state.explicitPermissions = ['ACCOUNT_WRITE'];

  const firstSession = await service.verifySessionToken(firstLogin.token);

  assert.deepEqual(firstLogin.user.permissions, ['PORTAL_USER', 'ACCOUNT_READ']);
  assert.deepEqual(firstSession.permissions, ['PORTAL_USER', 'ACCOUNT_READ']);
  assert.equal(state.permissionReads, 1);
});

test('refreshSessionUser applies updated contact permissions from PostgreSQL', async () => {
  const { service, state } = await createAuthService({
    defaultPermissions: ['PORTAL_USER'],
    explicitPermissions: ['ACCOUNT_READ'],
    contactEmail: 'user@example.com',
  });

  const firstLogin = await service.loginWithPassword('user@example.com', VALID_PASSWORD, '127.0.0.1');
  state.explicitPermissions = ['ACCOUNT_WRITE'];

  const refreshedSession = await service.refreshSessionUser(firstLogin.token);

  assert.deepEqual(firstLogin.user.permissions, ['PORTAL_USER', 'ACCOUNT_READ']);
  assert.deepEqual(refreshedSession.permissions, ['PORTAL_USER', 'ACCOUNT_WRITE']);
  assert.equal(state.permissionReads, 2);
});

test('createOidcLoginStart derives the callback from the current public origin and stores it in the flow token', async () => {
  const { service } = await createAuthService();

  const response = await service.createOidcLoginStart(
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

  const redirectUrl = new URL(response.redirectUrl);
  assert.equal(
    redirectUrl.searchParams.get('redirect_uri'),
    'http://localhost:5173/api/auth/oidc/google/callback',
  );

  const decoded = verify(response.flowToken, 'jwt-secret') as Record<string, unknown>;
  assert.equal(decoded.redirectUri, 'http://localhost:5173/api/auth/oidc/google/callback');
});

test('completeOidcLogin reuses the callback stored in the flow token during token exchange', async () => {
  const { service } = await createAuthService({
    contactEmail: 'oidc-user@example.com',
  });
  const originalFetch = global.fetch;
  let capturedBody = '';

  const loginStart = await service.createOidcLoginStart(
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
  const decoded = verify(loginStart.flowToken, 'jwt-secret') as Record<string, unknown>;

  global.fetch = (async (_input, init) => {
    capturedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ id_token: 'oidc-id-token' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    const payload = await service.completeOidcLogin('google', {
      flowToken: loginStart.flowToken,
      state: String(decoded.state),
      code: 'auth-code',
    });

    assert.equal(payload.user.authMethod, 'oidc');
    assert.equal(payload.user.authProvider, 'google');
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(
    capturedBody,
    /redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fapi%2Fauth%2Foidc%2Fgoogle%2Fcallback/,
  );
});
