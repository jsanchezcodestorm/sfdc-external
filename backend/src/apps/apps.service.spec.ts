import assert from 'node:assert/strict';
import test from 'node:test';

import { AppsService } from './apps.service';

test('listAvailableApps keeps only entities allowed by ACL, drops empty apps, and adds keyPrefix', async () => {
  const repository = {
    async listAvailableApps(permissionCodes: string[]) {
      assert.deepEqual(permissionCodes, ['PORTAL_USER', 'PORTAL_OPERATIONS']);

      return [
        {
          id: 'sales',
          label: 'Sales',
          entities: [
            { id: 'account', label: 'Account', objectApiName: 'Account', basePath: '/sales/account' },
            { id: 'opportunity', label: 'Opportunity', objectApiName: 'Opportunity' },
          ],
        },
        {
          id: 'hr',
          label: 'HR',
          entities: [{ id: 'employee', label: 'Employee', objectApiName: 'Contact' }],
        },
      ];
    },
  };

  const aclService = {
    normalizePermissions(permissionCodes: string[]) {
      return [...permissionCodes];
    },
    canAccess(permissionCodes: string[], resourceId: string) {
      assert.deepEqual(permissionCodes, ['PORTAL_USER', 'PORTAL_OPERATIONS']);
      return resourceId === 'entity:account' || resourceId === 'entity:opportunity';
    },
  };
  const salesforceService = {
    async describeObject(objectApiName: string) {
      if (objectApiName === 'Account') {
        return { keyPrefix: '001' };
      }

      return { keyPrefix: '006' };
    },
  };

  const service = new AppsService(repository as never, aclService as never, salesforceService as never);

  const response = await service.listAvailableApps({
    sub: '003000000000001AAA',
    email: 'user@example.com',
    permissions: ['PORTAL_USER', 'PORTAL_OPERATIONS'],
  });

  assert.deepEqual(response.items, [
    {
      id: 'sales',
      label: 'Sales',
      entities: [
        {
          id: 'account',
          label: 'Account',
          objectApiName: 'Account',
          basePath: '/sales/account',
          keyPrefix: '001',
        },
        { id: 'opportunity', label: 'Opportunity', objectApiName: 'Opportunity', keyPrefix: '006' },
      ],
    },
  ]);
});

test('listAvailableApps deduplicates describe lookups by objectApiName across visible entities', async () => {
  const describeCalls: string[] = [];
  const repository = {
    async listAvailableApps() {
      return [
        {
          id: 'sales',
          label: 'Sales',
          entities: [
            { id: 'account', label: 'Account', objectApiName: 'Account' },
            { id: 'account-archive', label: 'Archived Account', objectApiName: 'Account' },
          ],
        },
      ];
    },
  };
  const aclService = {
    normalizePermissions(permissionCodes: string[]) {
      return [...permissionCodes];
    },
    canAccess(permissionCodes: string[], resourceId: string) {
      assert.deepEqual(permissionCodes, ['PORTAL_USER']);
      return resourceId === 'entity:account' || resourceId === 'entity:account-archive';
    },
  };
  const salesforceService = {
    async describeObject(objectApiName: string) {
      describeCalls.push(objectApiName);
      return { keyPrefix: '001' };
    },
  };

  const service = new AppsService(repository as never, aclService as never, salesforceService as never);

  const response = await service.listAvailableApps({
    sub: '003000000000001AAA',
    permissions: ['PORTAL_USER'],
  } as never);

  assert.equal(describeCalls.length, 1);
  assert.equal(describeCalls[0], 'Account');
  assert.deepEqual(response.items[0]?.entities, [
    { id: 'account', label: 'Account', objectApiName: 'Account', keyPrefix: '001' },
    { id: 'account-archive', label: 'Archived Account', objectApiName: 'Account', keyPrefix: '001' },
  ]);
});
