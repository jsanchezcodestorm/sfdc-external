import assert from 'node:assert/strict';
import test from 'node:test';

import { ServiceUnavailableException } from '@nestjs/common';

import { SetupSecretsService } from './setup-secrets.service';

function createService(rawKey?: string) {
  const configService = {
    get(key: string) {
      const values: Record<string, string> = {};

      if (rawKey !== undefined) {
        values.SETUP_SECRETS_KEY = rawKey;
      }

      return values[key];
    },
  };

  return new SetupSecretsService(configService as never);
}

test('encryptJson and decryptJson round-trip setup payloads', () => {
  const service = createService('11'.repeat(32));

  const encrypted = service.encryptJson({
    mode: 'access-token',
    instanceUrl: 'https://example.my.salesforce.com',
    accessToken: 'secret-token',
  });
  const decrypted = service.decryptJson<Record<string, unknown>>(encrypted);

  assert.deepEqual(decrypted, {
    mode: 'access-token',
    instanceUrl: 'https://example.my.salesforce.com',
    accessToken: 'secret-token',
  });
});

test('encryptJson fails when SETUP_SECRETS_KEY is missing', () => {
  const service = createService();

  assert.throws(
    () => service.encryptJson({ value: true }),
    (error: unknown) =>
      error instanceof ServiceUnavailableException &&
      error.message === 'SETUP_SECRETS_KEY is not configured',
  );
});

test('constructor rejects invalid SETUP_SECRETS_KEY formats', () => {
  assert.throws(
    () => createService('not-a-valid-key'),
    (error: unknown) =>
      error instanceof ServiceUnavailableException &&
      error.message === 'SETUP_SECRETS_KEY must be a hex or base64 encoded 32-byte key',
  );
});

test('deriveScopedSecret is deterministic per context and differs across contexts', () => {
  const service = createService('11'.repeat(32));

  const authSecret = service.deriveScopedSecret('local-credential-password:v1');
  const sameAuthSecret = service.deriveScopedSecret('local-credential-password:v1');
  const otherSecret = service.deriveScopedSecret('other-context:v1');

  assert.equal(Buffer.compare(authSecret, sameAuthSecret), 0);
  assert.notEqual(Buffer.compare(authSecret, otherSecret), 0);
});
