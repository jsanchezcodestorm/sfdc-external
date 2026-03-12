import assert from 'node:assert/strict';
import test from 'node:test';

import { AppsService } from './apps.service';

test('listAvailableApps keeps only items allowed by ACL and adds entity keyPrefix', async () => {
  const repository = {
    async listAvailableApps(permissionCodes: string[]) {
      assert.deepEqual(permissionCodes, ['PORTAL_USER', 'PORTAL_OPERATIONS']);

      return [
        {
          id: 'sales',
          label: 'Sales',
          items: [
            {
              id: 'home',
              kind: 'home',
              label: 'Home',
              page: { blocks: [] },
            },
            {
              id: 'account',
              kind: 'entity',
              label: 'Account',
              entityId: 'account',
              objectApiName: 'Account',
            },
            {
              id: 'sales-kpi',
              kind: 'custom-page',
              label: 'KPI',
              resourceId: 'route:sales-kpi',
              page: { blocks: [] },
            },
          ],
        },
        {
          id: 'hr',
          label: 'HR',
          items: [
            {
              id: 'home',
              kind: 'home',
              label: 'Home',
              page: { blocks: [] },
            },
            {
              id: 'employee',
              kind: 'entity',
              label: 'Employee',
              entityId: 'employee',
              objectApiName: 'Contact',
            },
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
      assert.deepEqual(permissionCodes, ['PORTAL_USER', 'PORTAL_OPERATIONS']);
      return resourceId === 'entity:account' || resourceId === 'route:sales-kpi';
    },
  };
  const salesforceService = {
    async describeObject(objectApiName: string) {
      if (objectApiName === 'Account') {
        return { keyPrefix: '001' };
      }

      return { keyPrefix: '003' };
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
      items: [
        {
          id: 'home',
          kind: 'home',
          label: 'Home',
          page: { blocks: [] },
        },
        {
          id: 'account',
          kind: 'entity',
          label: 'Account',
          entityId: 'account',
          objectApiName: 'Account',
          keyPrefix: '001',
        },
        {
          id: 'sales-kpi',
          kind: 'custom-page',
          label: 'KPI',
          resourceId: 'route:sales-kpi',
          page: { blocks: [] },
        },
      ],
    },
    {
      id: 'hr',
      label: 'HR',
      items: [
        {
          id: 'home',
          kind: 'home',
          label: 'Home',
          page: { blocks: [] },
        },
      ],
    },
  ]);
});

test('listAvailableApps deduplicates describe lookups by objectApiName across visible entity items', async () => {
  const describeCalls: string[] = [];
  const repository = {
    async listAvailableApps() {
      return [
        {
          id: 'sales',
          label: 'Sales',
          items: [
            { id: 'home', kind: 'home', label: 'Home', page: { blocks: [] } },
            {
              id: 'account',
              kind: 'entity',
              label: 'Account',
              entityId: 'account',
              objectApiName: 'Account',
            },
            {
              id: 'account-archive',
              kind: 'entity',
              label: 'Archived Account',
              entityId: 'account-archive',
              objectApiName: 'Account',
            },
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
  assert.deepEqual(response.items[0]?.items, [
    { id: 'home', kind: 'home', label: 'Home', page: { blocks: [] } },
    { id: 'account', kind: 'entity', label: 'Account', entityId: 'account', objectApiName: 'Account', keyPrefix: '001' },
    {
      id: 'account-archive',
      kind: 'entity',
      label: 'Archived Account',
      entityId: 'account-archive',
      objectApiName: 'Account',
      keyPrefix: '001',
    },
  ]);
});
