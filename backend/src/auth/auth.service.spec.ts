import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthService } from './auth.service';

const CONTACT_ID = '003000000000001AAA';

function createAuthService(options?: {
  defaultPermissions?: string[];
  explicitPermissions?: string[];
  adminFallbackEmail?: string;
  userEmail?: string;
}) {
  const state = {
    explicitPermissions: options?.explicitPermissions ?? ['ACCOUNT_READ'],
  };

  const configService = {
    get(key: string, fallback?: string) {
      const values: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'google-client-id',
        JWT_SECRET: 'jwt-secret',
        JWT_EXPIRES_IN_SECONDS: '3600',
      };

      if (options?.adminFallbackEmail) {
        values.ADMIN_FALLBACK_EMAIL = options.adminFallbackEmail;
      }

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
      return [...state.explicitPermissions];
    },
  };

  const service = new AuthService(
    configService as never,
    aclService as never,
    aclContactPermissionsRepository as never,
    {} as never,
  );

  (service as unknown as Record<string, unknown>).verifyGoogleIdToken = async () => ({
    email: options?.userEmail ?? 'user@example.com',
    email_verified: true,
  });
  (service as unknown as Record<string, unknown>).resolveSalesforceContact = async () => ({
    id: CONTACT_ID,
    recordTypeDeveloperName: 'Customer',
  });

  return { service, state };
}

test('loginWithGoogleIdToken merges default, explicit, and admin fallback permissions', async () => {
  const { service } = createAuthService({
    defaultPermissions: ['PORTAL_USER'],
    explicitPermissions: ['ACCOUNT_READ', 'PORTAL_USER'],
    adminFallbackEmail: 'admin@example.com',
    userEmail: 'admin@example.com',
  });

  const response = await service.loginWithGoogleIdToken('test-token');

  assert.deepEqual(response.user.permissions, ['PORTAL_USER', 'ACCOUNT_READ', 'PORTAL_ADMIN']);
  assert.equal(response.user.contactRecordTypeDeveloperName, 'Customer');
});

test('contact permission changes apply on the next authenticated request', async () => {
  const { service, state } = createAuthService({
    defaultPermissions: ['PORTAL_USER'],
    explicitPermissions: ['ACCOUNT_READ'],
    userEmail: 'user@example.com',
  });

  const firstLogin = await service.loginWithGoogleIdToken('first-token');
  state.explicitPermissions = ['ACCOUNT_WRITE'];

  const firstSession = await service.verifySessionToken(firstLogin.token);

  assert.deepEqual(firstLogin.user.permissions, ['PORTAL_USER', 'ACCOUNT_READ']);
  assert.deepEqual(firstSession.permissions, ['PORTAL_USER', 'ACCOUNT_WRITE']);
});
