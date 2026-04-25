import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthService } from './auth.service';

const CONTACT_ID = '003000000000001AAA';
const LEGACY_CONTACT_ID = '003LEGACY0000001AAA';

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function createAuthService(options?: {
  allowedOrigin?: string | null;
  bootstrapAdminEmail?: string | null;
  defaultPermissions?: string[];
  explicitPermissions?: string[];
}) {
  const state = {
    permissionReads: [] as string[][],
  };

  const configService = {
    get(key: string, fallback?: string) {
      const values: Record<string, string> = {
        FRONTEND_ORIGINS: 'http://localhost:5173',
        PLATFORM_AUTH_PUBLIC_BASE_URL: 'https://auth.example',
        SESSION_COOKIE_DOMAIN: 'localhost',
        NODE_ENV: 'development',
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
    async listPermissionCodesBySubjectIds(subjectIds: string[]) {
      state.permissionReads.push(subjectIds);
      return options?.explicitPermissions ?? ['ACCOUNT_READ'];
    },
  };

  const authPublicOriginService = {
    resolveAllowedOrigin() {
      return options?.allowedOrigin === undefined ? 'http://localhost:5173' : options.allowedOrigin;
    },
  };

  const setupService = {
    async getCompletedAdminEmail() {
      return options?.bootstrapAdminEmail ?? null;
    },
  };

  const service = new AuthService(
    configService as never,
    aclService as never,
    aclContactPermissionsRepository as never,
    authPublicOriginService as never,
    setupService as never,
  );

  return { service, state };
}

function withPlatformAuthFetch(payload: unknown) {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  const previousAuthUrl = process.env.PLATFORM_AUTH_SERVICE_URL;
  const previousToken = process.env.PLATFORM_INTERNAL_TOKEN;

  process.env.PLATFORM_AUTH_SERVICE_URL = 'http://platform-auth.test';
  process.env.PLATFORM_INTERNAL_TOKEN = 'internal-token';
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;

      if (previousAuthUrl === undefined) {
        delete process.env.PLATFORM_AUTH_SERVICE_URL;
      } else {
        process.env.PLATFORM_AUTH_SERVICE_URL = previousAuthUrl;
      }

      if (previousToken === undefined) {
        delete process.env.PLATFORM_INTERNAL_TOKEN;
      } else {
        process.env.PLATFORM_INTERNAL_TOKEN = previousToken;
      }
    },
  };
}

function createPlatformUser(email = 'admin@example.com') {
  return {
    id: CONTACT_ID,
    email,
    authProvider: 'local',
    authMethod: 'local',
    memberships: [
      {
        productCode: 'sfdc-external',
        subjectId: LEGACY_CONTACT_ID,
        attributes: {
          sessionClaims: {
            accountId: '001000000000001AAA',
          },
        },
      },
    ],
  };
}

test('loginWithPassword proxies credentials and maps platform membership permissions', async () => {
  const { service, state } = createAuthService({
    defaultPermissions: ['PORTAL_USER'],
    explicitPermissions: ['ACCOUNT_READ', 'PORTAL_USER'],
    bootstrapAdminEmail: 'admin@example.com',
  });
  const fetchMock = withPlatformAuthFetch({
    accessToken: 'access-token',
    user: createPlatformUser('Admin@Example.com'),
  });

  try {
    const response = await service.loginWithPassword('admin@example.com', 'Password!123');
    const requestBody = JSON.parse(String(fetchMock.calls[0]?.init?.body));

    assert.equal(fetchMock.calls[0]?.url, 'http://platform-auth.test/auth/login/password');
    assert.deepEqual(requestBody, {
      username: 'admin@example.com',
      password: 'Password!123',
      productCode: 'sfdc-external',
    });
    assert.equal(response.token, 'access-token');
    assert.equal(response.user.sub, CONTACT_ID);
    assert.equal(response.user.identityId, CONTACT_ID);
    assert.equal(response.user.email, 'admin@example.com');
    assert.deepEqual(response.user.permissions, ['PORTAL_USER', 'ACCOUNT_READ', 'PORTAL_ADMIN']);
    assert.deepEqual(response.user.legacySubjectIds, [LEGACY_CONTACT_ID]);
    assert.deepEqual(response.user.subjectTraits, { accountId: '001000000000001AAA' });
    assert.deepEqual(state.permissionReads, [[CONTACT_ID, LEGACY_CONTACT_ID]]);
  } finally {
    fetchMock.restore();
  }
});

test('verifySessionToken resolves platform sessions with fresh local permissions', async () => {
  const { service, state } = createAuthService({
    defaultPermissions: ['PORTAL_USER'],
    explicitPermissions: ['ACCOUNT_WRITE'],
  });
  const fetchMock = withPlatformAuthFetch({
    user: createPlatformUser('user@example.com'),
  });

  try {
    const user = await service.verifySessionToken('session-token');
    const requestBody = JSON.parse(String(fetchMock.calls[0]?.init?.body));

    assert.equal(fetchMock.calls[0]?.url, 'http://platform-auth.test/internal/session/resolve');
    assert.deepEqual(requestBody, {
      token: 'session-token',
      productCode: 'sfdc-external',
    });
    assert.deepEqual(user.permissions, ['PORTAL_USER', 'ACCOUNT_WRITE']);
    assert.deepEqual(state.permissionReads, [[CONTACT_ID, LEGACY_CONTACT_ID]]);
  } finally {
    fetchMock.restore();
  }
});

test('createOidcLoginStart delegates OIDC start to platform auth with a product return URL', async () => {
  const { service } = createAuthService();

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

  assert.equal(redirectUrl.origin, 'https://auth.example');
  assert.equal(redirectUrl.pathname, '/auth/oidc/google/start');
  assert.equal(redirectUrl.searchParams.get('productCode'), 'sfdc-external');
  assert.equal(redirectUrl.searchParams.get('returnTo'), 'http://localhost:5173/#/login');
});

test('buildOidcCallbackProxyUrl forwards only populated callback parameters', () => {
  const { service } = createAuthService();

  const url = new URL(
    service.buildOidcCallbackProxyUrl('custom/provider', {
      code: 'auth-code',
      state: 'state-value',
      error: '',
      error_description: '  ',
    }),
  );

  assert.equal(url.origin, 'https://auth.example');
  assert.equal(url.pathname, '/auth/oidc/custom%2Fprovider/callback');
  assert.equal(url.searchParams.get('code'), 'auth-code');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.has('error'), false);
  assert.equal(url.searchParams.has('error_description'), false);
});
