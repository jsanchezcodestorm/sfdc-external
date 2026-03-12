import assert from 'node:assert/strict';
import test from 'node:test';

import { AclResourceSyncService } from './acl-resource-sync.service';

function createService() {
  const replaceCalls: Array<unknown[]> = [];
  const reloaded: unknown[] = [];

  const service = new AclResourceSyncService(
    {
      values() {
        return [];
      }
    } as never,
    {
      entityConfigRecord: {
        async findMany() {
          return [
            {
              id: 'account',
              label: 'Account',
              objectApiName: 'Account'
            }
          ];
        }
      },
      queryTemplateRecord: {
        async findMany() {
          return [];
        }
      }
    } as never,
    {
      async loadSnapshot() {
        return {
          permissions: [{ code: 'PORTAL_USER' }],
          defaultPermissions: ['PORTAL_USER'],
          resources: [
            {
              id: 'query:legacy-missing',
              type: 'query',
              accessMode: 'permission-bound',
              managedBy: 'system',
              syncState: 'present',
              sourceType: 'query',
              sourceRef: 'legacy-missing',
              permissions: ['PORTAL_USER']
            }
          ]
        };
      }
    } as never,
    {
      async replaceResources(resources: unknown[]) {
        replaceCalls.push(resources);
      }
    } as never,
    {
      async reload() {
        reloaded.push(true);
      }
    } as never
  );

  return {
    service,
    replaceCalls,
    reloaded
  };
}

test('syncSystemResources creates discovered route/entity resources and marks removed system resources stale', async () => {
  const harness = createService();

  const result = await harness.service.syncSystemResources();

  assert.equal(result.createdCount, 10);
  assert.equal(result.staleCount, 1);
  assert.equal(harness.replaceCalls.length, 1);
  assert.equal(harness.reloaded.length, 1);

  const resources = harness.replaceCalls[0] as Array<{
    id: string;
    accessMode: string;
    managedBy: string;
    syncState: string;
  }>;
  const discoveredRoute = resources.find((resource) => resource.id === 'route:admin-auth');
  const discoveredEntity = resources.find((resource) => resource.id === 'entity:account');
  const staleQuery = resources.find((resource) => resource.id === 'query:legacy-missing');

  assert.deepEqual(discoveredRoute, {
    id: 'route:admin-auth',
    type: 'route',
    accessMode: 'disabled',
    managedBy: 'system',
    syncState: 'present',
    sourceType: 'route',
    sourceRef: 'route:admin-auth',
    target: '/admin/auth/providers',
    description: 'Provider di login e credenziali locali.',
    permissions: []
  });
  assert.equal(discoveredEntity?.accessMode, 'disabled');
  assert.equal(discoveredEntity?.managedBy, 'system');
  assert.equal(staleQuery?.syncState, 'stale');
});
