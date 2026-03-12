import assert from 'node:assert/strict';
import test from 'node:test';

import jsforce from 'jsforce';

import { SalesforceNotConfiguredException } from './salesforce-not-configured.exception';
import { SalesforceService } from './salesforce.service';

function createSalesforceService(options?: {
  setup?: {
    siteName: string;
    adminEmail: string;
    salesforce:
      | {
          mode: 'access-token';
          instanceUrl: string;
          accessToken: string;
        }
      | {
          mode: 'username-password';
          loginUrl: string;
          username: string;
          password: string;
          securityToken?: string;
        };
    completedAt: string;
  } | null;
}) {
  const configService = {
    get(key: string) {
      const values: Record<string, string> = {
        SALESFORCE_DESCRIBE_CACHE_TTL_MS: '21600000',
        SALESFORCE_DESCRIBE_STALE_WHILE_REVALIDATE_MS: '21600000',
      };

      return values[key];
    },
  };

  const prismaService = {
    salesforceSObjectDescribeCache: {
      async findUnique() {
        return null;
      },
      async upsert() {},
      async deleteMany() {},
    },
  };

  const auditWriteService = {
    async recordSecurityEventOrThrow() {},
  };

  const setupService = {
    async getCompletedSetup() {
      return options?.setup ?? null;
    },
  };

  return new SalesforceService(
    configService as never,
    prismaService as never,
    auditWriteService as never,
    setupService as never,
  );
}

test('getConnection fails explicitly when setup is not completed', async () => {
  const service = createSalesforceService();

  await assert.rejects(
    () =>
      (service as unknown as {
        getConnection(): Promise<unknown>;
      }).getConnection(),
    (error: unknown) =>
      error instanceof SalesforceNotConfiguredException &&
      error.message === 'Salesforce is not configured',
  );
});

test('getConnection uses persisted access token configuration from setup', async () => {
  const originalConnection = (jsforce as unknown as { Connection: unknown }).Connection;
  let receivedOptions: Record<string, unknown> | null = null;

  class FakeConnection {
    instanceUrl: string;
    userInfo = {
      organizationId: '00D000000000001',
    };
    version = '61.0';

    constructor(options: Record<string, unknown>) {
      receivedOptions = options;
      this.instanceUrl = String(options.instanceUrl ?? '');
    }

    async identity() {
      return {
        organization_id: '00D000000000001',
        username: 'integration@example.com',
      };
    }
  }

  (jsforce as unknown as { Connection: unknown }).Connection = FakeConnection;

  try {
    const service = createSalesforceService({
      setup: {
        siteName: 'Acme Portal',
        adminEmail: 'admin@example.com',
        salesforce: {
          mode: 'access-token',
          instanceUrl: 'https://example.my.salesforce.com',
          accessToken: 'token-123',
        },
        completedAt: '2026-03-10T10:00:00.000Z',
      },
    });

    await (service as unknown as { getConnection(): Promise<unknown> }).getConnection();

    assert.deepEqual(receivedOptions, {
      accessToken: 'token-123',
      instanceUrl: 'https://example.my.salesforce.com',
    });
  } finally {
    (jsforce as unknown as { Connection: unknown }).Connection = originalConnection;
  }
});

test('describeObjectFields maps picklist and reference metadata from describe payload', async () => {
  const service = createSalesforceService();

  (service as unknown as { describeObject: (objectApiName: string) => Promise<unknown> }).describeObject = async (
    objectApiName: string,
  ) => {
    assert.equal(objectApiName, 'Account');
    return {
      fields: [
        {
          name: 'Industry',
          label: 'Industry',
          type: 'picklist',
          nillable: true,
          createable: true,
          updateable: true,
          filterable: true,
          defaultedOnCreate: false,
          calculated: false,
          autoNumber: false,
          picklistValues: [
            { value: 'Technology', label: 'Technology', active: true, defaultValue: true },
            { value: 'Finance', label: 'Finance', active: true, defaultValue: false },
          ],
        },
        {
          name: 'ParentId',
          label: 'Parent Account',
          type: 'reference',
          nillable: true,
          createable: true,
          updateable: true,
          filterable: true,
          relationshipName: 'Parent',
          referenceTo: ['Account'],
        },
      ],
    };
  };

  const fields = await service.describeObjectFields('Account');

  assert.deepEqual(fields, [
    {
      name: 'Industry',
      label: 'Industry',
      type: 'picklist',
      nillable: true,
      createable: true,
      updateable: true,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
      picklistValues: [
        { value: 'Technology', label: 'Technology', active: true, defaultValue: true },
        { value: 'Finance', label: 'Finance', active: true, defaultValue: false },
      ],
      relationshipName: undefined,
      referenceTo: undefined,
    },
    {
      name: 'ParentId',
      label: 'Parent Account',
      type: 'reference',
      nillable: true,
      createable: true,
      updateable: true,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
      picklistValues: undefined,
      relationshipName: 'Parent',
      referenceTo: ['Account'],
    },
  ]);
});
