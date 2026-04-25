import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthProviderAdminService } from './auth-provider-admin.service';

type FetchCall = {
  url: string;
  init?: RequestInit;
};

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

test('listProviders proxies the admin provider catalog to platform auth', async () => {
  const fetchMock = withPlatformAuthFetch({
    items: [{ id: 'local', status: 'active' }],
  });
  const service = new AuthProviderAdminService();

  try {
    const payload = await service.listProviders();

    assert.deepEqual(payload.items, [{ id: 'local', status: 'active' }]);
    assert.equal(fetchMock.calls[0]?.url, 'http://platform-auth.test/auth/admin/providers');
  } finally {
    fetchMock.restore();
  }
});

test('getPublicProviders proxies the public provider catalog to platform auth', async () => {
  const fetchMock = withPlatformAuthFetch({
    items: [{ id: 'local', type: 'local', label: 'Username e password' }],
  });
  const service = new AuthProviderAdminService();

  try {
    const payload = await service.getPublicProviders();

    assert.deepEqual(payload.items, [
      { id: 'local', type: 'local', label: 'Username e password' },
    ]);
    assert.equal(fetchMock.calls[0]?.url, 'http://platform-auth.test/auth/providers');
  } finally {
    fetchMock.restore();
  }
});

test('getProvider encodes provider ids when proxying admin provider detail', async () => {
  const fetchMock = withPlatformAuthFetch({
    provider: {
      id: 'custom/provider',
      callbackUri: 'http://localhost:5173/api/auth/oidc/custom%2Fprovider/callback',
    },
  });
  const service = new AuthProviderAdminService();

  try {
    const payload = await service.getProvider('custom/provider', {} as never);

    assert.equal(payload.provider.id, 'custom/provider');
    assert.equal(
      fetchMock.calls[0]?.url,
      'http://platform-auth.test/auth/admin/providers/custom%2Fprovider',
    );
  } finally {
    fetchMock.restore();
  }
});
