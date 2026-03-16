import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { AppsAdminService } from './apps-admin.service';

function createService(overrides?: {
  repository?: Record<string, unknown>;
  configService?: Record<string, unknown>;
  auditWriteService?: Record<string, unknown>;
}) {
  const repository = {
    async hasApp() {
      return false;
    },
    async assertEntityIdsExist() {},
    async assertResourceIdsExist() {},
    async assertPermissionCodesExist() {},
    async assertDashboardIdsExist() {},
    async upsertApp() {},
    async getApp() {
      return null;
    },
    ...overrides?.repository,
  };

  const resourceAccessService = {
    assertKebabCaseId() {},
    assertEntityId() {},
  };

  const auditWriteService = {
    async recordApplicationSuccessOrThrow() {},
    ...overrides?.auditWriteService,
  };

  const configService = {
    get(_key: string, fallback = '') {
      return fallback;
    },
    ...overrides?.configService,
  };

  return new AppsAdminService(
    repository as never,
    resourceAccessService as never,
    auditWriteService as never,
    configService as never,
  );
}

function createPageBlock(type: 'markdown' | 'link-list' | 'dashboard', overrides: Record<string, unknown> = {}) {
  const base = {
    id: `${type}-block`,
    type,
    layout: {
      colSpan: 12,
      rowSpan: type === 'dashboard' ? 4 : 2,
    },
  };

  if (type === 'markdown') {
    return {
      ...base,
      markdown: 'Welcome',
      ...overrides,
    };
  }

  if (type === 'link-list') {
    return {
      ...base,
      links: [{ label: 'Accounts', targetType: 'app-item', target: 'account' }],
      ...overrides,
    };
  }

  return {
    ...base,
    dashboardId: '7a68dbe0-7e75-4a8d-9fd3-0d8a4d516760',
    ...overrides,
  };
}

test('createApp rejects duplicate item ids', async () => {
  const service = createService();

  await assert.rejects(
    () =>
      service.createApp({
        id: 'sales',
        label: 'Sales',
        items: [
          { id: 'home', kind: 'home', label: 'Home', page: { blocks: [] } },
          { id: 'account', kind: 'entity', label: 'Account', entityId: 'account' },
          { id: 'account', kind: 'custom-page', label: 'Overview', page: { blocks: [] } },
        ],
        permissionCodes: ['PORTAL_USER'],
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'app.items must not contain duplicate ids',
  );
});

test('createApp rejects duplicate entity assignments', async () => {
  const service = createService();

  await assert.rejects(
    () =>
      service.createApp({
        id: 'sales',
        label: 'Sales',
        items: [
          { id: 'home', kind: 'home', label: 'Home', page: { blocks: [] } },
          { id: 'account', kind: 'entity', label: 'Account', entityId: 'account' },
          { id: 'account-pipeline', kind: 'entity', label: 'Account Pipeline', entityId: 'account' },
        ],
        permissionCodes: ['PORTAL_USER'],
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'app.items must not contain duplicate entityId assignments',
  );
});

test('createApp rejects iframe hosts outside APP_EMBED_ALLOWED_HOSTS', async () => {
  const service = createService({
    configService: {
      get(key: string, fallback = '') {
        return key === 'APP_EMBED_ALLOWED_HOSTS' ? 'reports.example.com' : fallback;
      },
    },
  });

  await assert.rejects(
    () =>
      service.createApp({
        id: 'sales',
        label: 'Sales',
        items: [
          { id: 'home', kind: 'home', label: 'Home', page: { blocks: [] } },
          {
            id: 'external-dashboard',
            kind: 'external-link',
            label: 'External Dashboard',
            url: 'https://other.example.com/report',
            openMode: 'iframe',
          },
        ],
        permissionCodes: ['PORTAL_USER'],
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'app item external-dashboard iframe host must be listed in APP_EMBED_ALLOWED_HOSTS',
  );
});

test('createApp persists normalized payload and records audit metadata', async () => {
  const storedApps = new Map<string, Record<string, unknown>>();
  const auditCalls: Array<Record<string, unknown>> = [];

  const service = createService({
    repository: {
      async hasApp(appId: string) {
        return storedApps.has(appId);
      },
      async assertEntityIdsExist(entityIds: string[]) {
        assert.deepEqual(entityIds, ['account']);
      },
      async assertResourceIdsExist(resourceIds: string[]) {
        assert.deepEqual(resourceIds, ['route:sales-kpi']);
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
    },
    auditWriteService: {
      async recordApplicationSuccessOrThrow(input: Record<string, unknown>) {
        auditCalls.push(input);
      },
    },
    configService: {
      get(key: string, fallback = '') {
        return key === 'APP_EMBED_ALLOWED_HOSTS' ? 'reports.example.com' : fallback;
      },
    },
  });

  const response = await service.createApp({
    id: 'sales',
    label: 'Sales',
    description: 'Commercial workspace',
    sortOrder: 3,
    items: [
      {
        id: 'home',
        kind: 'home',
        label: 'Home',
        page: {
          blocks: [createPageBlock('markdown')],
        },
      },
      {
        id: 'account',
        kind: 'entity',
        label: 'Accounts',
        entityId: 'account',
      },
      {
        id: 'sales-kpi',
        kind: 'custom-page',
        label: 'KPI',
        resourceId: 'route:sales-kpi',
        page: {
          blocks: [
            createPageBlock('link-list'),
          ],
        },
      },
      {
        id: 'executive-report',
        kind: 'report',
        label: 'Executive Report',
      },
    ],
    permissionCodes: ['PORTAL_USER', 'PORTAL_OPERATIONS'],
  });

  assert.deepEqual(response.app, {
    id: 'sales',
    label: 'Sales',
    description: 'Commercial workspace',
    sortOrder: 3,
    items: [
      {
        id: 'home',
        kind: 'home',
        label: 'Home',
        description: undefined,
        page: {
          blocks: [
            {
              id: 'markdown-block',
              type: 'markdown',
              layout: {
                colSpan: 12,
                rowSpan: 2,
              },
              markdown: 'Welcome',
            },
          ],
        },
      },
      {
        id: 'account',
        kind: 'entity',
        label: 'Accounts',
        description: undefined,
        resourceId: undefined,
        entityId: 'account',
      },
      {
        id: 'sales-kpi',
        kind: 'custom-page',
        label: 'KPI',
        description: undefined,
        resourceId: 'route:sales-kpi',
        page: {
          blocks: [
            {
              id: 'link-list-block',
              type: 'link-list',
              layout: {
                colSpan: 12,
                rowSpan: 2,
              },
              title: undefined,
              links: [{ label: 'Accounts', targetType: 'app-item', target: 'account', openMode: undefined }],
            },
          ],
        },
      },
      {
        id: 'executive-report',
        kind: 'report',
        label: 'Executive Report',
        description: undefined,
        resourceId: undefined,
      },
    ],
    permissionCodes: ['PORTAL_USER', 'PORTAL_OPERATIONS'],
  });
  assert.equal(auditCalls.length, 1);
  assert.deepEqual(auditCalls[0].metadata, {
    itemCount: 4,
    entityCount: 1,
    permissionCount: 2,
    sortOrder: 3,
    itemsByKind: {
      home: 1,
      entity: 1,
      'custom-page': 1,
      report: 1,
    },
  });
});

test('createApp accepts entity items that reference mixed-case entity ids', async () => {
  const storedApps = new Map<string, Record<string, unknown>>();

  const service = createService({
    repository: {
      async hasApp(appId: string) {
        return storedApps.has(appId);
      },
      async assertEntityIdsExist(entityIds: string[]) {
        assert.deepEqual(entityIds, ['Product2']);
      },
      async assertResourceIdsExist(resourceIds: string[]) {
        assert.deepEqual(resourceIds, []);
      },
      async assertPermissionCodesExist(permissionCodes: string[]) {
        assert.deepEqual(permissionCodes, []);
      },
      async upsertApp(app: Record<string, unknown>) {
        storedApps.set(String(app.id), app);
      },
      async getApp(appId: string) {
        const value = storedApps.get(appId);
        assert.ok(value);
        return value;
      },
    },
  });

  const response = await service.createApp({
    id: 'catalog',
    label: 'Catalog',
    items: [
      { id: 'home', kind: 'home', label: 'Home', page: { blocks: [] } },
      { id: 'product', kind: 'entity', label: 'Products', entityId: 'Product2' },
    ],
    permissionCodes: [],
  });

  assert.equal(response.app.items[1]?.kind, 'entity');
  assert.equal(response.app.items[1]?.entityId, 'Product2');
});

test('createApp accepts dashboard items as internal workspace modules', async () => {
  const storedApps = new Map<string, Record<string, unknown>>();

  const service = createService({
    repository: {
      async hasApp(appId: string) {
        return storedApps.has(appId);
      },
      async assertEntityIdsExist(entityIds: string[]) {
        assert.deepEqual(entityIds, []);
      },
      async assertResourceIdsExist(resourceIds: string[]) {
        assert.deepEqual(resourceIds, ['rest:dashboards-read']);
      },
      async assertPermissionCodesExist(permissionCodes: string[]) {
        assert.deepEqual(permissionCodes, ['PORTAL_USER']);
      },
      async assertDashboardIdsExist(appId: string, dashboardIds: string[]) {
        assert.deepEqual(appId, 'operations');
        assert.deepEqual(dashboardIds, []);
      },
      async upsertApp(app: Record<string, unknown>) {
        storedApps.set(String(app.id), app);
      },
      async getApp(appId: string) {
        const value = storedApps.get(appId);
        assert.ok(value);
        return value;
      },
    },
  });

  const response = await service.createApp({
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'home', kind: 'home', label: 'Home', page: { blocks: [] } },
      {
        id: 'ops-dashboard',
        kind: 'dashboard',
        label: 'Ops Dashboard',
        resourceId: 'rest:dashboards-read',
      },
    ],
    permissionCodes: ['PORTAL_USER'],
  });

  assert.deepEqual(response.app.items, [
    {
      id: 'home',
      kind: 'home',
      label: 'Home',
      description: undefined,
      page: { blocks: [] },
    },
    {
      id: 'ops-dashboard',
      kind: 'dashboard',
      label: 'Ops Dashboard',
      description: undefined,
      resourceId: 'rest:dashboards-read',
    },
  ]);
});

test('createApp accepts dashboard blocks inside home page', async () => {
  const service = createService({
    repository: {
      async assertEntityIdsExist() {},
      async assertResourceIdsExist() {},
      async assertPermissionCodesExist(permissionCodes: string[]) {
        assert.deepEqual(permissionCodes, ['PORTAL_USER']);
      },
      async assertDashboardIdsExist(appId: string, dashboardIds: string[]) {
        assert.deepEqual(appId, 'operations');
        assert.deepEqual(dashboardIds, ['7a68dbe0-7e75-4a8d-9fd3-0d8a4d516760']);
      },
      async upsertApp() {},
      async getApp() {
        return {
          id: 'operations',
          label: 'Operations',
          sortOrder: 0,
          items: [],
          permissionCodes: ['PORTAL_USER'],
        };
      },
    },
  });

  await assert.doesNotReject(() =>
    service.createApp({
      id: 'operations',
      label: 'Operations',
      items: [
        {
          id: 'home',
          kind: 'home',
          label: 'Home',
          page: {
            blocks: [createPageBlock('dashboard')],
          },
        },
      ],
      permissionCodes: ['PORTAL_USER'],
    }),
  );
});

test('createApp rejects dashboard blocks on custom pages', async () => {
  const service = createService();

  await assert.rejects(
    () =>
      service.createApp({
        id: 'sales',
        label: 'Sales',
        items: [
          { id: 'home', kind: 'home', label: 'Home', page: { blocks: [] } },
          {
            id: 'overview',
            kind: 'custom-page',
            label: 'Overview',
            page: {
              blocks: [createPageBlock('dashboard')],
            },
          },
        ],
        permissionCodes: ['PORTAL_USER'],
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'app.items[1].page.blocks[0].type dashboard is not allowed here',
  );
});
