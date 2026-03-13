import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { SetupSalesforceMode } from '../prisma/generated/client';

import { SetupService } from './setup.service';

function createSetupService(options?: {
  record?: {
    siteName: string;
    adminEmail: string;
    salesforceMode: SetupSalesforceMode;
    salesforceConfigEncrypted: string;
    completedAt: Date;
  } | null;
}) {
  const state = {
    savedSetup: null as Record<string, unknown> | null,
    savedCredential: null as Record<string, unknown> | null,
  };

  const setupRepository = {
    async getRecord() {
      return options?.record ?? null;
    },
    async saveCompletedSetup(input: Record<string, unknown>, tx?: { savedSetup: Record<string, unknown> | null }) {
      (tx ?? state).savedSetup = input;
    },
  };

  const setupSecretsService = {
    encryptJson(value: unknown) {
      return JSON.stringify({ encrypted: value });
    },
    decryptJson() {
      return {
        mode: 'username-password',
        loginUrl: 'https://login.salesforce.com',
        username: 'integration@example.com',
        password: 'secret',
      };
    },
  };

  const localCredentialProvisioningService = {
    async upsertResolvedCredential(input: Record<string, unknown>, options?: { tx?: { savedCredential: Record<string, unknown> | null } }) {
      (options?.tx ?? state).savedCredential = input;
    },
  };

  const prismaService = {
    async $transaction<T>(callback: (tx: { savedSetup: Record<string, unknown> | null; savedCredential: Record<string, unknown> | null }) => Promise<T>) {
      const txState = {
        savedSetup: state.savedSetup,
        savedCredential: state.savedCredential,
      };

      const result = await callback(txState);
      state.savedSetup = txState.savedSetup;
      state.savedCredential = txState.savedCredential;
      return result;
    },
  };

  const service = new SetupService(
    setupRepository as never,
    setupSecretsService as never,
    localCredentialProvisioningService as never,
    prismaService as never,
  );

  (service as unknown as Record<string, unknown>).probeSalesforceConnection = async () => ({
    success: true,
    organizationId: '00D000000000001',
    instanceUrl: 'https://example.my.salesforce.com',
  });
  (service as unknown as Record<string, unknown>).resolveBootstrapAdminContact = async () => ({
    id: '003000000000001AAA',
    email: 'admin@example.com',
  });

  return { service, state };
}

test('getStatus reports pending when setup is missing', async () => {
  const { service } = createSetupService();

  const status = await service.getStatus();

  assert.deepEqual(status, {
    state: 'pending',
    authConfigMode: 'database',
  });
});

test('getStatus reports completed with site name when setup exists', async () => {
  const { service } = createSetupService({
    record: {
      siteName: 'Acme Portal',
      adminEmail: 'admin@example.com',
      salesforceMode: SetupSalesforceMode.USERNAME_PASSWORD,
      salesforceConfigEncrypted: '{"encrypted":true}',
      completedAt: new Date('2026-03-10T10:00:00.000Z'),
    },
  });

  const status = await service.getStatus();

  assert.deepEqual(status, {
    state: 'completed',
    siteName: 'Acme Portal',
    authConfigMode: 'database',
  });
});

test('completeSetup validates, encrypts, and persists the singleton setup record', async () => {
  const { service, state } = createSetupService();

  const status = await service.completeSetup({
    siteName: 'Acme Portal',
    adminEmail: 'admin@example.com',
    bootstrapPassword: 'Password!123',
    salesforce: {
      mode: 'access-token',
      instanceUrl: 'https://example.my.salesforce.com',
      accessToken: 'token-123',
    },
  });

  assert.deepEqual(status, {
    state: 'completed',
    siteName: 'Acme Portal',
    authConfigMode: 'database',
  });
  assert.deepEqual(state.savedSetup, {
    siteName: 'Acme Portal',
    adminEmail: 'admin@example.com',
    salesforceMode: SetupSalesforceMode.ACCESS_TOKEN,
    salesforceConfigEncrypted:
      '{"encrypted":{"mode":"access-token","instanceUrl":"https://example.my.salesforce.com","accessToken":"token-123"}}',
    completedAt: state.savedSetup?.completedAt,
  });
  assert.equal(state.savedSetup?.completedAt instanceof Date, true);
  assert.deepEqual(state.savedCredential, {
    contactId: '003000000000001AAA',
    username: 'admin@example.com',
    password: 'Password!123',
    enabled: true,
  });
});

test('completeSetup rejects repeated setup completion attempts', async () => {
  const { service } = createSetupService({
    record: {
      siteName: 'Configured Portal',
      adminEmail: 'admin@example.com',
      salesforceMode: SetupSalesforceMode.ACCESS_TOKEN,
      salesforceConfigEncrypted: '{"encrypted":true}',
      completedAt: new Date('2026-03-10T10:00:00.000Z'),
    },
  });

  await assert.rejects(
    () =>
      service.completeSetup({
        siteName: 'Another Portal',
        adminEmail: 'other@example.com',
        bootstrapPassword: 'Password!123',
        salesforce: {
          mode: 'access-token',
          instanceUrl: 'https://example.my.salesforce.com',
          accessToken: 'token-123',
        },
      }),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'Initial setup has already been completed',
  );
});

test('getCompletedSetup fails closed on invalid stored config payloads', async () => {
  const { service } = createSetupService({
    record: {
      siteName: 'Configured Portal',
      adminEmail: 'admin@example.com',
      salesforceMode: SetupSalesforceMode.USERNAME_PASSWORD,
      salesforceConfigEncrypted: '{"encrypted":true}',
      completedAt: new Date('2026-03-10T10:00:00.000Z'),
    },
  });

  (service as unknown as Record<string, unknown>).setupSecretsService = {
    decryptJson() {
      return { broken: true };
    },
  };

  await assert.rejects(
    () => service.getCompletedSetup(),
    (error: unknown) =>
      error instanceof ServiceUnavailableException &&
      error.message === 'Stored setup configuration is invalid',
  );
});

test('completeSetup fails when adminEmail does not map to a Salesforce Contact', async () => {
  const { service, state } = createSetupService();

  (service as unknown as Record<string, unknown>).resolveBootstrapAdminContact = async () => {
    throw new BadRequestException('adminEmail must match an existing Salesforce Contact before completing setup');
  };

  await assert.rejects(
    () =>
      service.completeSetup({
        siteName: 'Acme Portal',
        adminEmail: 'missing@example.com',
        bootstrapPassword: 'Password!123',
        salesforce: {
          mode: 'access-token',
          instanceUrl: 'https://example.my.salesforce.com',
          accessToken: 'token-123',
        },
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'adminEmail must match an existing Salesforce Contact before completing setup',
  );

  assert.equal(state.savedSetup, null);
  assert.equal(state.savedCredential, null);
});

test('completeSetup rolls back setup persistence when bootstrap credential creation fails', async () => {
  const { service, state } = createSetupService();

  (service as unknown as Record<string, unknown>).localCredentialProvisioningService = {
    async upsertResolvedCredential() {
      throw new BadRequestException('credential.password is required when creating a local credential');
    },
  };

  await assert.rejects(
    () =>
      service.completeSetup({
        siteName: 'Acme Portal',
        adminEmail: 'admin@example.com',
        bootstrapPassword: 'Password!123',
        salesforce: {
          mode: 'access-token',
          instanceUrl: 'https://example.my.salesforce.com',
          accessToken: 'token-123',
        },
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'credential.password is required when creating a local credential',
  );

  assert.equal(state.savedSetup, null);
  assert.equal(state.savedCredential, null);
});
