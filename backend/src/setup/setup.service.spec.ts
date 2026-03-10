import assert from 'node:assert/strict';
import test from 'node:test';

import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { SetupSalesforceMode } from '@prisma/client';

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
  };

  const setupRepository = {
    async getRecord() {
      return options?.record ?? null;
    },
    async saveCompletedSetup(input: Record<string, unknown>) {
      state.savedSetup = input;
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

  const service = new SetupService(
    setupRepository as never,
    setupSecretsService as never,
  );

  (service as unknown as Record<string, unknown>).probeSalesforceConnection = async () => ({
    success: true,
    organizationId: '00D000000000001',
    instanceUrl: 'https://example.my.salesforce.com',
  });

  return { service, state };
}

test('getStatus reports pending when setup is missing', async () => {
  const { service } = createSetupService();

  const status = await service.getStatus();

  assert.deepEqual(status, {
    state: 'pending',
    googleConfigMode: 'env',
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
    googleConfigMode: 'env',
  });
});

test('completeSetup validates, encrypts, and persists the singleton setup record', async () => {
  const { service, state } = createSetupService();

  const status = await service.completeSetup({
    siteName: 'Acme Portal',
    adminEmail: 'admin@example.com',
    salesforce: {
      mode: 'access-token',
      instanceUrl: 'https://example.my.salesforce.com',
      accessToken: 'token-123',
    },
  });

  assert.deepEqual(status, {
    state: 'completed',
    siteName: 'Acme Portal',
    googleConfigMode: 'env',
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
