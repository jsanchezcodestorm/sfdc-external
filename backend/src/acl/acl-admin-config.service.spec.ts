import assert from 'node:assert/strict';
import test from 'node:test';

import { AclAdminConfigService } from './acl-admin-config.service';

function createService(options?: {
  snapshot?: {
    permissions: Array<{ code: string; label?: string; description?: string; aliases?: string[] }>;
    defaultPermissions: string[];
    resources: Array<{ id: string; type: 'rest' | 'entity' | 'query' | 'route'; permissions: string[] }>;
  };
  appAssignments?: Array<{ permissionCode: string; appId: string }>;
}) {
  const replaceCalls: Array<Record<string, unknown>> = [];
  const auditCalls: Array<Record<string, unknown>> = [];
  const snapshots = [
    options?.snapshot ?? {
      permissions: [
        { code: 'PORTAL_USER' },
        { code: 'ACCOUNT_READ', aliases: ['READ_ACCOUNT'] },
      ],
      defaultPermissions: ['PORTAL_USER'],
      resources: [{ id: 'rest:entities-read', type: 'rest' as const, permissions: ['ACCOUNT_READ'] }],
    },
  ];

  const aclConfigRepository = {
    async loadSnapshot() {
      return snapshots[snapshots.length - 1];
    },
  };

  const aclAdminConfigRepository = {
    async replaceSnapshot(snapshot: Record<string, unknown>, replaceOptions?: Record<string, unknown>) {
      replaceCalls.push({ snapshot, replaceOptions });
      snapshots.push(snapshot as never);
    },
    async listPermissionAppAssignments() {
      return options?.appAssignments ?? [{ permissionCode: 'ACCOUNT_READ', appId: 'sales' }];
    },
    async assertAppIdsExist(appIds: string[]) {
      assert.deepEqual(appIds, ['sales']);
    },
  };

  const aclService = {
    async reload() {},
  };

  const auditWriteService = {
    async recordApplicationSuccessOrThrow(input: Record<string, unknown>) {
      auditCalls.push(input);
    },
  };

  const service = new AclAdminConfigService(
    aclConfigRepository as never,
    aclAdminConfigRepository as never,
    aclService as never,
    auditWriteService as never,
  );

  return { service, replaceCalls, auditCalls };
}

test('getPermission includes associated app ids', async () => {
  const { service } = createService();

  const response = await service.getPermission('ACCOUNT_READ');

  assert.deepEqual(response.appIds, ['sales']);
  assert.equal(response.appCount, 1);
});

test('updatePermission propagates renamed permission codes and app assignments', async () => {
  const { service, replaceCalls } = createService();

  await service.updatePermission(
    'ACCOUNT_READ',
    {
      code: 'ACCOUNT_EXPORT',
      aliases: ['EXPORT_ACCOUNT'],
    },
    ['sales'],
  );

  assert.equal(replaceCalls.length, 1);
  assert.deepEqual(replaceCalls[0].replaceOptions, {
    renamedPermissionCodes: [
      {
        previousCode: 'ACCOUNT_READ',
        nextCode: 'ACCOUNT_EXPORT',
      },
    ],
    replacedPermissionAppAssignments: [
      {
        permissionCode: 'ACCOUNT_EXPORT',
        appIds: ['sales'],
      },
    ],
  });
});

test('deletePermission propagates deleted permission codes', async () => {
  const { service, replaceCalls } = createService();

  await service.deletePermission('ACCOUNT_READ');

  assert.equal(replaceCalls.length, 1);
  assert.deepEqual(replaceCalls[0].replaceOptions, {
    deletedPermissionCodes: ['ACCOUNT_READ'],
  });
});
