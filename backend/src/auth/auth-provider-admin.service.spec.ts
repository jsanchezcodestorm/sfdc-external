import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthProviderAdminService } from './auth-provider-admin.service';

function createService() {
  const authProviderAdminRepository = {
    async listConfigs() {
      return [];
    },
    async findConfig() {
      return null;
    },
    async upsertConfig() {},
  };

  const authProviderRegistryService = {
    async listRuntimeProviders() {
      return [
        {
          id: 'local',
          providerFamily: 'local',
          type: 'local',
          label: 'Username e password',
          envEnabled: true,
          defaultSortOrder: 100,
          isConfigured: true,
          isRuntimeAvailable: true,
        },
      ];
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

  const setupSecretsService = {
    encryptJson(value: unknown) {
      return JSON.stringify(value);
    },
  };

  const auditWriteService = {
    async recordApplicationSuccessOrThrow() {},
  };

  return new AuthProviderAdminService(
    authProviderAdminRepository as never,
    authProviderRegistryService as never,
    authPublicOriginService as never,
    setupSecretsService as never,
    auditWriteService as never,
  );
}

test('listProviders exposes the fixed slot catalog with not_configured OIDC providers', async () => {
  const service = createService();

  const payload = await service.listProviders();

  assert.deepEqual(
    payload.items.map((item) => ({ id: item.id, status: item.status })),
    [
      { id: 'google', status: 'not_configured' },
      { id: 'entra-id', status: 'not_configured' },
      { id: 'auth0', status: 'not_configured' },
      { id: 'custom', status: 'not_configured' },
      { id: 'local', status: 'active' },
    ],
  );
});

test('getPublicProviders exposes local auth even when no OIDC provider is registered', async () => {
  const service = createService();

  const payload = await service.getPublicProviders();

  assert.deepEqual(payload, {
    items: [{ id: 'local', type: 'local', label: 'Username e password', loginPath: undefined }],
  });
});

test('getProvider exposes the derived callbackUri for the current origin', async () => {
  const service = createService();

  const payload = await service.getProvider(
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
  assert.equal(payload.provider.callbackUri, 'http://localhost:5173/api/auth/oidc/google/callback');
});
