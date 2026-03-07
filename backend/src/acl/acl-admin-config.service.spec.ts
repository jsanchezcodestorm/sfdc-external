import assert from 'node:assert/strict';
import test from 'node:test';

import { AclAdminConfigService } from './acl-admin-config.service';

function createService(options?: {
  snapshot?: {
    permissions: Array<{ code: string; label?: string; description?: string; aliases?: string[] }>;
    defaultPermissions: string[];
    resources: Array<{
      id: string;
      type: 'rest' | 'entity' | 'query' | 'route';
      target?: string;
      description?: string;
      permissions: string[];
    }>;
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
      resources: [
        {
          id: 'rest:entities-read',
          type: 'rest' as const,
          target: '/entities/read',
          description: 'Read entities',
          permissions: ['ACCOUNT_READ'],
        },
      ],
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

test('getPermission includes associated resources and app ids', async () => {
  const { service } = createService();

  const response = await service.getPermission('ACCOUNT_READ');

  assert.deepEqual(response.resources, [
    {
      id: 'rest:entities-read',
      type: 'rest',
      target: '/entities/read',
      description: 'Read entities',
      permissionCount: 1,
    },
  ]);
  assert.equal(response.resourceCount, 1);
  assert.deepEqual(response.appIds, ['sales']);
  assert.equal(response.appCount, 1);
});

test('createPermission associates selected resources and records resource metadata in audit', async () => {
  const { service, replaceCalls, auditCalls } = createService();

  await service.createPermission(
    {
      code: 'ACCOUNT_EXPORT',
      aliases: ['EXPORT_ACCOUNT'],
    },
    ['sales'],
    ['rest:entities-read'],
  );

  assert.equal(replaceCalls.length, 1);
  assert.deepEqual(
    (
      replaceCalls[0].snapshot as {
        resources: Array<{ id: string; permissions: string[] }>;
      }
    ).resources.map((resource) => ({
      id: resource.id,
      permissions: resource.permissions,
    })),
    [
      {
        id: 'rest:entities-read',
        permissions: ['ACCOUNT_READ', 'ACCOUNT_EXPORT'],
      },
    ],
  );
  const createAudit = auditCalls[0] as {
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  assert.deepEqual(createAudit.payload, {
    permission: {
      code: 'ACCOUNT_EXPORT',
      aliases: ['EXPORT_ACCOUNT'],
      label: undefined,
      description: undefined,
    },
    appIds: ['sales'],
    resourceIds: ['rest:entities-read'],
  });
  assert.equal(createAudit.metadata.resourceCount, 1);
});

test('updatePermission propagates renamed permission codes, app assignments, and resource selection', async () => {
  const { service, replaceCalls } = createService({
    snapshot: {
      permissions: [
        { code: 'PORTAL_USER' },
        { code: 'ACCOUNT_READ', aliases: ['READ_ACCOUNT'] },
      ],
      defaultPermissions: ['PORTAL_USER'],
      resources: [
        { id: 'rest:entities-read', type: 'rest', permissions: ['ACCOUNT_READ'] },
        { id: 'rest:entities-write', type: 'rest', permissions: ['ACCOUNT_READ'] },
      ],
    },
  });

  await service.updatePermission(
    'ACCOUNT_READ',
    {
      code: 'ACCOUNT_EXPORT',
      aliases: ['EXPORT_ACCOUNT'],
    },
    ['sales'],
    ['rest:entities-write'],
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
  assert.deepEqual(
    (
      replaceCalls[0].snapshot as {
        resources: Array<{ id: string; permissions: string[] }>;
      }
    ).resources.map((resource) => ({
      id: resource.id,
      permissions: resource.permissions,
    })),
    [
      {
        id: 'rest:entities-read',
        permissions: [],
      },
      {
        id: 'rest:entities-write',
        permissions: ['ACCOUNT_EXPORT'],
      },
    ],
  );
});

test('updatePermission removes deselected resources when the code is unchanged', async () => {
  const { service, replaceCalls } = createService({
    snapshot: {
      permissions: [
        { code: 'PORTAL_USER' },
        { code: 'ACCOUNT_READ' },
      ],
      defaultPermissions: ['PORTAL_USER'],
      resources: [
        { id: 'rest:entities-read', type: 'rest', permissions: ['ACCOUNT_READ'] },
        { id: 'rest:entities-write', type: 'rest', permissions: ['ACCOUNT_READ'] },
      ],
    },
  });

  await service.updatePermission(
    'ACCOUNT_READ',
    {
      code: 'ACCOUNT_READ',
    },
    ['sales'],
    ['rest:entities-read'],
  );

  assert.deepEqual(
    (
      replaceCalls[0].snapshot as {
        resources: Array<{ id: string; permissions: string[] }>;
      }
    ).resources.map((resource) => ({
      id: resource.id,
      permissions: resource.permissions,
    })),
    [
      {
        id: 'rest:entities-read',
        permissions: ['ACCOUNT_READ'],
      },
      {
        id: 'rest:entities-write',
        permissions: [],
      },
    ],
  );
});

test('updatePermission rejects duplicate and unknown resource ids', async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.updatePermission(
        'ACCOUNT_READ',
        {
          code: 'ACCOUNT_READ',
        },
        ['sales'],
        ['rest:entities-read', 'rest:entities-read'],
      ),
    (error: unknown) =>
      error instanceof Error && error.message === 'resourceIds must not contain duplicates',
  );

  await assert.rejects(
    () =>
      service.updatePermission(
        'ACCOUNT_READ',
        {
          code: 'ACCOUNT_READ',
        },
        ['sales'],
        ['rest:unknown'],
      ),
    (error: unknown) => error instanceof Error && error.message === 'Unknown resource ids: rest:unknown',
  );
});

test('deletePermission propagates deleted permission codes', async () => {
  const { service, replaceCalls } = createService();

  await service.deletePermission('ACCOUNT_READ');

  assert.equal(replaceCalls.length, 1);
  assert.deepEqual(replaceCalls[0].replaceOptions, {
    deletedPermissionCodes: ['ACCOUNT_READ'],
  });
});
