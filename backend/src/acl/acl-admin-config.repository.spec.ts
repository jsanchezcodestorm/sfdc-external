import assert from 'node:assert/strict';
import test from 'node:test';

import { AclAdminConfigRepository } from './acl-admin-config.repository';

const CONTACT_ID = '003000000000001AAA';

test('replaceSnapshot preserves renamed assignments and prunes deleted/default permissions', async () => {
  const state = {
    contactPermissions: [
      {
        contactId: CONTACT_ID,
        permissionCode: 'LEGACY_READ',
        createdAt: new Date('2026-03-07T09:00:00.000Z'),
        updatedAt: new Date('2026-03-07T09:00:00.000Z'),
      },
      {
        contactId: CONTACT_ID,
        permissionCode: 'DROP_ME',
        createdAt: new Date('2026-03-07T09:00:00.000Z'),
        updatedAt: new Date('2026-03-07T09:00:00.000Z'),
      },
      {
        contactId: CONTACT_ID,
        permissionCode: 'PORTAL_USER',
        createdAt: new Date('2026-03-07T09:00:00.000Z'),
        updatedAt: new Date('2026-03-07T09:00:00.000Z'),
      },
    ],
    permissions: [] as Array<Record<string, unknown>>,
    permissionAliases: [] as Array<Record<string, unknown>>,
    defaultPermissions: [] as Array<Record<string, unknown>>,
    resources: [] as Array<Record<string, unknown>>,
    resourcePermissions: [] as Array<Record<string, unknown>>,
  };

  const tx = {
    aclContactPermissionRecord: {
      async updateMany(input: {
        where: { permissionCode: string };
        data: { permissionCode: string };
      }) {
        for (const row of state.contactPermissions) {
          if (row.permissionCode === input.where.permissionCode) {
            row.permissionCode = input.data.permissionCode;
            row.updatedAt = new Date('2026-03-07T10:00:00.000Z');
          }
        }
      },
      async deleteMany(input?: { where?: { permissionCode?: { in: string[] } } }) {
        if (!input?.where?.permissionCode?.in) {
          state.contactPermissions = [];
          return;
        }

        const toDelete = new Set(input.where.permissionCode.in);
        state.contactPermissions = state.contactPermissions.filter(
          (row) => !toDelete.has(row.permissionCode),
        );
      },
    },
    aclResourcePermissionRecord: {
      async deleteMany() {
        state.resourcePermissions = [];
      },
      async create(input: { data: Record<string, unknown> }) {
        state.resourcePermissions.push(input.data);
      },
    },
    aclDefaultPermissionRecord: {
      async deleteMany() {
        state.defaultPermissions = [];
      },
      async create(input: { data: Record<string, unknown> }) {
        state.defaultPermissions.push(input.data);
      },
    },
    aclPermissionAliasRecord: {
      async deleteMany() {
        state.permissionAliases = [];
      },
      async create(input: { data: Record<string, unknown> }) {
        state.permissionAliases.push(input.data);
      },
    },
    aclResourceRecord: {
      async deleteMany() {
        state.resources = [];
      },
      async create(input: { data: Record<string, unknown> }) {
        state.resources.push(input.data);
      },
    },
    aclPermissionRecord: {
      async deleteMany() {
        state.permissions = [];
      },
      async create(input: { data: Record<string, unknown> }) {
        state.permissions.push(input.data);
      },
    },
  };

  const prisma = {
    async $transaction<T>(callback: (client: typeof tx) => Promise<T>) {
      return callback(tx);
    },
  };

  const repository = new AclAdminConfigRepository(prisma as never);

  await repository.replaceSnapshot(
    {
      permissions: [
        {
          code: 'PORTAL_USER',
        },
        {
          code: 'CONTACT_READ',
        },
      ],
      defaultPermissions: ['PORTAL_USER'],
      resources: [],
    },
    {
      renamedPermissionCodes: [
        {
          previousCode: 'LEGACY_READ',
          nextCode: 'CONTACT_READ',
        },
      ],
      deletedPermissionCodes: ['DROP_ME'],
    },
  );

  assert.deepEqual(
    state.contactPermissions.map((row) => row.permissionCode).sort(),
    ['CONTACT_READ'],
  );
});
