import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { AppsAdminService } from './apps-admin.service';

test('createApp rejects duplicate entity ids', async () => {
  const repository = {
    async hasApp() {
      return false;
    },
    async assertEntityIdsExist() {},
    async assertPermissionCodesExist() {},
  };

  const resourceAccessService = {
    assertKebabCaseId() {},
    assertEntityId() {},
  };

  const auditWriteService = {
    async recordApplicationSuccessOrThrow() {},
  };

  const service = new AppsAdminService(
    repository as never,
    resourceAccessService as never,
    auditWriteService as never,
  );

  await assert.rejects(
    () =>
      service.createApp({
        id: 'sales',
        label: 'Sales',
        entityIds: ['account', 'account'],
        permissionCodes: ['PORTAL_USER'],
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'app.entityIds must not contain duplicates',
  );
});

test('createApp rejects duplicate permission codes', async () => {
  const repository = {
    async hasApp() {
      return false;
    },
    async assertEntityIdsExist() {},
    async assertPermissionCodesExist() {},
  };

  const resourceAccessService = {
    assertKebabCaseId() {},
    assertEntityId() {},
  };

  const auditWriteService = {
    async recordApplicationSuccessOrThrow() {},
  };

  const service = new AppsAdminService(
    repository as never,
    resourceAccessService as never,
    auditWriteService as never,
  );

  await assert.rejects(
    () =>
      service.createApp({
        id: 'sales',
        label: 'Sales',
        entityIds: ['account'],
        permissionCodes: ['PORTAL_USER', 'PORTAL_USER'],
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'app.permissionCodes must not contain duplicates',
  );
});

test('createApp persists normalized payload and records audit metadata', async () => {
  const storedApps = new Map<string, Record<string, unknown>>();
  const auditCalls: Array<Record<string, unknown>> = [];

  const repository = {
    async hasApp(appId: string) {
      return storedApps.has(appId);
    },
    async assertEntityIdsExist(entityIds: string[]) {
      assert.deepEqual(entityIds, ['account', 'opportunity']);
    },
    async assertPermissionCodesExist(permissionCodes: string[]) {
      assert.deepEqual(permissionCodes, ['PORTAL_USER', 'PORTAL_OPERATIONS']);
    },
    async upsertApp(app: Record<string, unknown>) {
      storedApps.set(String(app.id), app);
    },
    async getApp(appId: string) {
      const value = storedApps.get(appId);
      assert.ok(value);
      return value;
    },
  };

  const resourceAccessService = {
    assertKebabCaseId() {},
    assertEntityId() {},
  };

  const auditWriteService = {
    async recordApplicationSuccessOrThrow(input: Record<string, unknown>) {
      auditCalls.push(input);
    },
  };

  const service = new AppsAdminService(
    repository as never,
    resourceAccessService as never,
    auditWriteService as never,
  );

  const response = await service.createApp({
    id: 'sales',
    label: 'Sales',
    description: 'Commercial workspace',
    sortOrder: 3,
    entityIds: ['account', 'opportunity'],
    permissionCodes: ['PORTAL_USER', 'PORTAL_OPERATIONS'],
  });

  assert.deepEqual(response.app, {
    id: 'sales',
    label: 'Sales',
    description: 'Commercial workspace',
    sortOrder: 3,
    entityIds: ['account', 'opportunity'],
    permissionCodes: ['PORTAL_USER', 'PORTAL_OPERATIONS'],
  });
  assert.equal(auditCalls.length, 1);
  assert.deepEqual(auditCalls[0].metadata, {
    entityCount: 2,
    permissionCount: 2,
    sortOrder: 3,
  });
});
