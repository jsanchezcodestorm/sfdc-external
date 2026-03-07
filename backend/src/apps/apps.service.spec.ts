import assert from 'node:assert/strict';
import test from 'node:test';

import { AppsService } from './apps.service';

test('listAvailableApps keeps only entities allowed by ACL and drops empty apps', async () => {
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

  const service = new AppsService(repository as never, aclService as never);

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
        { id: 'account', label: 'Account', objectApiName: 'Account', basePath: '/sales/account' },
        { id: 'opportunity', label: 'Opportunity', objectApiName: 'Opportunity' },
      ],
    },
  ]);
});
