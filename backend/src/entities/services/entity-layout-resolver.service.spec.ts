import assert from 'node:assert/strict';
import test from 'node:test';

import { NotFoundException } from '@nestjs/common';

import { EntityLayoutResolverService } from './entity-layout-resolver.service';

const entityConfig = {
  id: 'account',
  label: 'Accounts',
  objectApiName: 'Account',
  layouts: [
    {
      id: 'default-form',
      label: 'Default Form',
      isDefault: true,
      form: {
        title: {
          create: 'New Account',
          edit: 'Edit Account',
        },
        sections: [
          {
            title: 'Main',
            fields: [{ field: 'Name' }],
          },
        ],
      },
      assignments: [],
    },
    {
      id: 'retail-form',
      label: 'Retail Form',
      form: {
        title: {
          create: 'New Retail Account',
          edit: 'Edit Retail Account',
        },
        sections: [
          {
            title: 'Main',
            fields: [{ field: 'Name' }],
          },
        ],
      },
      assignments: [
        {
          recordTypeDeveloperName: 'Retail',
          permissionCode: 'ACCOUNT_RETAIL_CREATE',
        },
      ],
    },
  ],
} as const;

function createService() {
  return new EntityLayoutResolverService({
    async describeRecordTypes() {
      return [
        {
          id: '012-retail',
          developerName: 'Retail',
          label: 'Retail',
          active: true,
          available: true,
          defaultRecordTypeMapping: false,
          master: false,
        },
        {
          id: '012-test',
          developerName: 'TestRecordtype',
          label: 'TestRecordtype',
          active: true,
          available: true,
          defaultRecordTypeMapping: false,
          master: false,
        },
      ];
    },
  } as never);
}

test('resolveLayout falls back to default when the record type has no explicit assignment', () => {
  const service = createService();

  const resolved = service.resolveLayout(
    entityConfig as never,
    { permissions: ['PORTAL_ADMIN'] } as never,
    'form',
    'TestRecordtype',
  );

  assert.equal(resolved.layoutId, 'default-form');
});

test('resolveLayout does not fall back to default when an explicit record type assignment exists but permission is missing', async () => {
  const service = createService();

  assert.throws(
    () =>
      service.resolveLayout(
        entityConfig as never,
        { permissions: ['PORTAL_ADMIN'] } as never,
        'form',
        'Retail',
      ),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.message === 'No applicable form layout configured for account',
  );
});

test('listCreateOptions hides record types whose explicit assignments do not match the current user permissions', async () => {
  const service = createService();

  const options = await service.listCreateOptions(
    entityConfig as never,
    { permissions: ['PORTAL_ADMIN'] } as never,
  );

  assert.deepEqual(options, {
    items: [
      {
        recordTypeDeveloperName: 'TestRecordtype',
        label: 'TestRecordtype',
        layoutId: 'default-form',
      },
    ],
    recordTypeSelectionRequired: true,
  });
});

test('listCreateOptions includes explicitly assigned record types when the current user has the required permission', async () => {
  const service = createService();

  const options = await service.listCreateOptions(
    entityConfig as never,
    { permissions: ['PORTAL_ADMIN', 'ACCOUNT_RETAIL_CREATE'] } as never,
  );

  assert.deepEqual(options, {
    items: [
      {
        recordTypeDeveloperName: 'Retail',
        label: 'Retail',
        layoutId: 'retail-form',
      },
      {
        recordTypeDeveloperName: 'TestRecordtype',
        label: 'TestRecordtype',
        layoutId: 'default-form',
      },
    ],
    recordTypeSelectionRequired: true,
  });
});

test('resolveRecordTypeDeveloperName falls back to undefined when the Salesforce record type query fails', async () => {
  const service = new EntityLayoutResolverService({
    async executeReadOnlyQuery() {
      throw new Error('INVALID_FIELD: No such column RecordType.DeveloperName');
    },
  } as never);

  const resolved = await service.resolveRecordTypeDeveloperName(
    entityConfig as never,
    '001000000000001AAA',
  );

  assert.equal(resolved, undefined);
});

test('listCreateOptions disables record type selection when Salesforce exposes no non-master record types', async () => {
  const service = new EntityLayoutResolverService({
    async describeRecordTypes() {
      return [];
    },
  } as never);

  const options = await service.listCreateOptions(
    entityConfig as never,
    { permissions: ['PORTAL_ADMIN'] } as never,
  );

  assert.deepEqual(options, {
    items: [],
    recordTypeSelectionRequired: false,
  });
});
