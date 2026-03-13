import assert from 'node:assert/strict';
import test from 'node:test';

import { AclService } from './acl.service';

function createService() {
  return new AclService({
    async loadSnapshot() {
      return {
        permissions: [
          { code: 'PORTAL_USER' },
          { code: 'REPORT_ADMIN' }
        ],
        defaultPermissions: ['PORTAL_USER'],
        resources: [
          {
            id: 'rest:legacy-authenticated',
            type: 'rest',
            accessMode: 'authenticated',
            managedBy: 'manual',
            syncState: 'present',
            permissions: []
          },
          {
            id: 'rest:disabled',
            type: 'rest',
            accessMode: 'disabled',
            managedBy: 'system',
            syncState: 'present',
            permissions: ['REPORT_ADMIN']
          },
          {
            id: 'rest:stale',
            type: 'rest',
            accessMode: 'permission-bound',
            managedBy: 'system',
            syncState: 'stale',
            permissions: ['REPORT_ADMIN']
          },
          {
            id: 'rest:permission-bound',
            type: 'rest',
            accessMode: 'permission-bound',
            managedBy: 'system',
            syncState: 'present',
            permissions: ['REPORT_ADMIN']
          },
          {
            id: 'rest:permission-bound-empty',
            type: 'rest',
            accessMode: 'permission-bound',
            managedBy: 'system',
            syncState: 'present',
            permissions: []
          }
        ]
      };
    }
  } as never);
}

test('authenticated resources preserve legacy access when permissions are empty', async () => {
  const service = createService();
  await service.reload();

  assert.equal(service.canAccess([], 'rest:legacy-authenticated'), true);
  assert.equal(service.canAccess(['PORTAL_USER'], 'rest:legacy-authenticated'), true);
});

test('disabled and stale resources always deny', async () => {
  const service = createService();
  await service.reload();

  assert.equal(service.canAccess(['REPORT_ADMIN'], 'rest:disabled'), false);
  assert.equal(service.canAccess(['REPORT_ADMIN'], 'rest:stale'), false);
});

test('permission-bound resources require an effective permission and stay closed when empty', async () => {
  const service = createService();
  await service.reload();

  assert.equal(service.canAccess(['PORTAL_USER'], 'rest:permission-bound'), false);
  assert.equal(service.canAccess(['REPORT_ADMIN'], 'rest:permission-bound'), true);
  assert.equal(service.canAccess(['REPORT_ADMIN'], 'rest:permission-bound-empty'), false);
});
