import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { QueryAuditService } from '../audit/query-audit.service';

import { EntitiesService } from './entities.service';

function createHarness(
  rawResult: Record<string, unknown> = { totalSize: 0, done: true, records: [] },
  queryMoreResults: Record<string, unknown>[] = [],
) {
  const createCalls: Array<Record<string, unknown>> = [];
  const completeCalls: Array<Record<string, unknown>> = [];
  const visibilityAuditCalls: Array<Record<string, unknown>> = [];
  const pageQueryCalls: Array<Record<string, unknown>> = [];
  const queryMoreCalls: Array<Record<string, unknown>> = [];
  const cursorCreateCalls: Array<Record<string, unknown>> = [];
  const cursorReadCalls: string[] = [];
  let cursorIndex = 0;

  const auditWriteService = {
    async createQueryAuditIntentOrThrow(input: Record<string, unknown>) {
      createCalls.push(input);
      return BigInt(createCalls.length);
    },
    async completeQueryAuditOrThrow(input: Record<string, unknown>) {
      completeCalls.push(input);
    },
    normalizeErrorCode() {
      return 'QUERY_FAILED';
    },
  };

  const salesforceService = {
    async executeReadOnlyQuery() {
      return rawResult;
    },
    async executeReadOnlyQueryPage(soql: string, pageSize: number) {
      pageQueryCalls.push({ soql, pageSize });
      return rawResult;
    },
    async executeReadOnlyQueryMore(locator: string, pageSize: number) {
      queryMoreCalls.push({ locator, pageSize });
      return queryMoreResults.shift() ?? { totalSize: 0, done: true, records: [] };
    },
  };

  const visibility = {
    contactId: '003000000000001',
    permissionsHash: 'perm-hash',
    recordType: null,
    objectApiName: 'Account',
    appliedCones: ['sales'],
    appliedRules: ['rule-1'],
    decision: 'ALLOW',
    reasonCode: 'ALLOW_MATCH',
    policyVersion: 7,
    objectPolicyVersion: 3,
    compiledPredicate: "OwnerId = '005000000000001'",
    compiledFields: ['Id', 'Name'],
    deniedFields: [],
    baseWhere: '',
    finalWhere: '',
  };

  const visibilityService = {
    async recordAudit(input: Record<string, unknown>) {
      visibilityAuditCalls.push(input);
    },
  };

  const queryAuditService = new QueryAuditService(
    auditWriteService as never,
    salesforceService as never,
    visibilityService as never,
  );

  const resourceAccessService = {
    assertEntityId() {},
    async authorizeObjectAccess() {
      return visibility;
    },
  };

  const entityLayoutResolverService = {
    async resolveRecordTypeDeveloperName() {
      return undefined;
    },
    async listCreateOptions() {
      return { items: [], recordTypeSelectionRequired: false };
    },
    resolveLayout(entityConfig: Record<string, unknown>, _user: Record<string, unknown>, capability: 'detail' | 'form') {
      const layouts = Array.isArray(entityConfig.layouts) ? entityConfig.layouts : [];
      const layoutFromConfig = layouts.find((entry) =>
        capability === 'detail' ? Boolean((entry as { detail?: unknown }).detail) : Boolean((entry as { form?: unknown }).form),
      );
      if (layoutFromConfig) {
        return {
          layout: layoutFromConfig,
          layoutId: String((layoutFromConfig as { id?: string }).id ?? 'default'),
          recordTypeDeveloperName: undefined,
        };
      }

      const synthesizedLayout = {
        id: 'default',
        label: 'Default',
        detail: entityConfig.detail,
        form: entityConfig.form,
        assignments: [],
        isDefault: true,
      };

      return {
        layout: synthesizedLayout,
        layoutId: synthesizedLayout.id,
        recordTypeDeveloperName: undefined,
      };
    },
  };

  const service = new EntitiesService(
    {} as never,
    queryAuditService,
    resourceAccessService as never,
    {
      async getEntityConfig() {
        return {};
      },
    } as never,
    entityLayoutResolverService as never,
    {
      async createCursor(scope: Record<string, unknown>, sourceState: Record<string, unknown>) {
        cursorCreateCalls.push({ scope, sourceState });
        cursorIndex += 1;
        return `cursor-${cursorIndex}`;
      },
      async readCursor(token: string) {
        cursorReadCalls.push(token);
        throw new Error('readCursor not stubbed');
      },
      async deleteExpiredCursors() {},
      hashFingerprint(parts: unknown[]) {
        return JSON.stringify(parts);
      },
    } as never,
    salesforceService as never,
    visibilityService as never,
  );

  return {
    service,
    createCalls,
    completeCalls,
    visibilityAuditCalls,
    pageQueryCalls,
    queryMoreCalls,
    cursorCreateCalls,
    cursorReadCalls,
  };
}

function patchServiceMethods(service: EntitiesService, methods: Record<string, unknown>) {
  Object.assign(service as unknown as Record<string, unknown>, methods);
}

const user = {
  sub: '003000000000001',
  email: 'user@example.com',
  permissions: ['PORTAL_USER'],
};

test('getEntityList records query audit metadata and counters', async () => {
  const harness = createHarness({
    totalSize: 2,
    done: true,
    records: [{ Id: '001' }, { Id: '002' }],
  });
  const listView = {
    id: 'pipeline',
    pageSize: 10,
    columns: ['Name'],
    query: { object: 'Account' },
  };

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      list: {
        title: 'Accounts',
        subtitle: 'Open accounts',
        views: [listView],
      },
    }),
    selectListView: () => listView,
    filterVisibleColumns: () => ['Name'],
    extractColumnFieldPaths: () => ['Name'],
    ensureVisibleFields() {},
    resolveLookupProjectionFields: async () => [],
    buildSoqlFromQueryConfig: async () => ({
      soql: "SELECT Id, Name FROM Account WHERE Name LIKE 'Acme%'",
      baseWhere: "Name LIKE 'Acme%'",
      finalWhere: "(Name LIKE 'Acme%') AND (OwnerId = '005000000000001')",
      selectFields: ['Id', 'Name'],
    }),
  });

  const response = await harness.service.getEntityList(user as never, 'account', {
    pageSize: 10,
    search: 'Acme',
  } as never);

  assert.equal(response.records.length, 2);
  assert.equal(response.nextCursor, null);
  assert.equal(harness.createCalls.length, 1);
  assert.equal(harness.createCalls[0].queryKind, 'ENTITY_LIST');
  assert.equal(harness.createCalls[0].targetId, 'account');
  assert.deepEqual(harness.createCalls[0].metadata, {
    entityId: 'account',
    viewId: 'pipeline',
    pageSize: 10,
    search: 'Acme',
    selectedFields: ['Id', 'Name'],
    paginationMode: 'cursor',
    cursorPhase: 'initial',
  });
  assert.equal(harness.completeCalls[0].status, 'SUCCESS');
  assert.equal(harness.completeCalls[0].rowCount, 2);
  assert.ok(Number(harness.completeCalls[0].durationMs) >= 0);
  assert.equal(harness.visibilityAuditCalls[0].rowCount, 2);
});

test('getEntityList builds paginated SOQL without OFFSET and returns a nextCursor', async () => {
  const harness = createHarness({
    totalSize: 3,
    done: false,
    nextRecordsUrl: '/services/data/v1/query/next',
    records: [
      { Id: '001', Name: 'Acme' },
      { Id: '002', Name: 'Beta' },
      { Id: '003', Name: 'Gamma' },
    ],
  });
  const listView = {
    id: 'pipeline',
    pageSize: 2,
    columns: ['Name'],
    query: {
      object: 'Account',
      fields: ['Name'],
      orderBy: [{ field: 'Name', direction: 'ASC' }],
      limit: 25,
    },
  };

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      list: {
        title: 'Accounts',
        views: [listView],
      },
    }),
    resolveLookupProjectionFields: async () => [],
    visibilityService: {
      applyFieldVisibility: (fields: string[]) => fields,
      async recordAudit(input: Record<string, unknown>) {
        harness.visibilityAuditCalls.push(input);
      },
    },
  });

  const response = await harness.service.getEntityList(user as never, 'account', {
    pageSize: 2,
  } as never);

  assert.deepEqual(
    response.records.map((record) => String(record.Id)),
    ['001', '002'],
  );
  assert.equal(response.nextCursor, 'cursor-1');
  assert.ok(!String(harness.pageQueryCalls[0].soql).includes('OFFSET'));
  assert.ok(!String(harness.pageQueryCalls[0].soql).includes('LIMIT'));
  assert.equal(harness.cursorCreateCalls.length, 1);
  assert.equal(
    String((harness.cursorCreateCalls[0].sourceState as { sourceLocator?: string }).sourceLocator),
    '/services/data/v1/query/next',
  );
  assert.equal(
    ((harness.cursorCreateCalls[0].sourceState as { sourceRecords: unknown[] }).sourceRecords ?? [])
      .length,
    1,
  );
});

test('getEntityList serves a cursor page from buffered records without queryMore', async () => {
  const harness = createHarness({
    totalSize: 0,
    done: true,
    records: [],
  });
  const listView = {
    id: 'pipeline',
    pageSize: 2,
    columns: ['Name'],
    query: { object: 'Account' },
  };

  patchServiceMethods(harness.service, {
    buildEntityQueryFingerprint: () => 'fingerprint-1',
    buildSoqlFromQueryConfig: async () => ({
      soql: 'SELECT Id, Name FROM Account',
      baseWhere: undefined,
      finalWhere: undefined,
      selectFields: ['Id', 'Name'],
    }),
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      list: {
        title: 'Accounts',
        views: [listView],
      },
    }),
    filterVisibleColumns: () => ['Name'],
    extractColumnFieldPaths: () => ['Name'],
    ensureVisibleFields() {},
    resolveLookupProjectionFields: async () => [],
    visibilityService: {
      applyFieldVisibility: (fields: string[]) => fields,
      async recordAudit(input: Record<string, unknown>) {
        harness.visibilityAuditCalls.push(input);
      },
    },
  });
  (harness.service as unknown as {
    entityQueryCursorService: { readCursor: (token: string) => Promise<unknown> };
  }).entityQueryCursorService.readCursor = async (token: string) => {
    harness.cursorReadCalls.push(token);
    return {
      token,
      cursorKind: 'list',
      contactId: user.sub,
      entityId: 'account',
      viewId: 'pipeline',
      objectApiName: 'Account',
      pageSize: 2,
      totalSize: 4,
      resolvedSoql: 'SELECT Id, Name FROM Account',
      baseWhere: '',
      finalWhere: '',
      queryFingerprint: 'fingerprint-1',
      sourceRecords: [{ Id: '001' }, { Id: '002' }],
      expiresAt: new Date(Date.now() + 60_000),
    };
  };

  const response = await harness.service.getEntityList(user as never, 'account', {
    cursor: 'cursor-buffered',
    pageSize: 2,
  } as never);

  assert.deepEqual(
    response.records.map((record) => String(record.Id)),
    ['001', '002'],
  );
  assert.equal(response.nextCursor, null);
  assert.equal(harness.queryMoreCalls.length, 0);
});

test('getEntityList continues a cursor page with queryMore when the buffer is short', async () => {
  const harness = createHarness(
    {
      totalSize: 0,
      done: true,
      records: [],
    },
    [
      {
        totalSize: 4,
        done: true,
        records: [{ Id: '002' }, { Id: '003' }],
      },
    ],
  );
  const listView = {
    id: 'pipeline',
    pageSize: 2,
    columns: ['Name'],
    query: { object: 'Account' },
  };

  patchServiceMethods(harness.service, {
    buildEntityQueryFingerprint: () => 'fingerprint-2',
    buildSoqlFromQueryConfig: async () => ({
      soql: 'SELECT Id, Name FROM Account',
      baseWhere: undefined,
      finalWhere: undefined,
      selectFields: ['Id', 'Name'],
    }),
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      list: {
        title: 'Accounts',
        views: [listView],
      },
    }),
    filterVisibleColumns: () => ['Name'],
    extractColumnFieldPaths: () => ['Name'],
    ensureVisibleFields() {},
    resolveLookupProjectionFields: async () => [],
    visibilityService: {
      applyFieldVisibility: (fields: string[]) => fields,
      async recordAudit(input: Record<string, unknown>) {
        harness.visibilityAuditCalls.push(input);
      },
    },
  });
  (harness.service as unknown as {
    entityQueryCursorService: { readCursor: (token: string) => Promise<unknown> };
  }).entityQueryCursorService.readCursor = async (token: string) => {
    harness.cursorReadCalls.push(token);
    return {
      token,
      cursorKind: 'list',
      contactId: user.sub,
      entityId: 'account',
      viewId: 'pipeline',
      objectApiName: 'Account',
      pageSize: 2,
      totalSize: 4,
      resolvedSoql: 'SELECT Id, Name FROM Account',
      baseWhere: '',
      finalWhere: '',
      queryFingerprint: 'fingerprint-2',
      sourceLocator: '/services/data/v1/query/next',
      sourceRecords: [{ Id: '001' }],
      expiresAt: new Date(Date.now() + 60_000),
    };
  };

  const response = await harness.service.getEntityList(user as never, 'account', {
    cursor: 'cursor-query-more',
    pageSize: 2,
  } as never);

  assert.deepEqual(
    response.records.map((record) => String(record.Id)),
    ['001', '002'],
  );
  assert.equal(response.nextCursor, 'cursor-1');
  assert.equal(harness.queryMoreCalls.length, 1);
  assert.equal(
    (harness.createCalls[0].metadata as { cursorPhase?: string }).cursorPhase,
    'continue',
  );
});

test('getEntityList rejects a cursor when the fingerprint does not match', async () => {
  const harness = createHarness({
    totalSize: 0,
    done: true,
    records: [],
  });
  const listView = {
    id: 'pipeline',
    pageSize: 2,
    columns: ['Name'],
    query: { object: 'Account' },
  };

  patchServiceMethods(harness.service, {
    buildEntityQueryFingerprint: () => 'fingerprint-fresh',
    buildSoqlFromQueryConfig: async () => ({
      soql: 'SELECT Id, Name FROM Account',
      baseWhere: undefined,
      finalWhere: undefined,
      selectFields: ['Id', 'Name'],
    }),
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      list: {
        title: 'Accounts',
        views: [listView],
      },
    }),
    filterVisibleColumns: () => ['Name'],
    extractColumnFieldPaths: () => ['Name'],
    ensureVisibleFields() {},
    resolveLookupProjectionFields: async () => [],
    visibilityService: {
      applyFieldVisibility: (fields: string[]) => fields,
      async recordAudit(input: Record<string, unknown>) {
        harness.visibilityAuditCalls.push(input);
      },
    },
  });
  (harness.service as unknown as {
    entityQueryCursorService: { readCursor: (token: string) => Promise<unknown> };
  }).entityQueryCursorService.readCursor = async (token: string) => ({
    token,
    cursorKind: 'list',
    contactId: user.sub,
    entityId: 'account',
    viewId: 'pipeline',
    objectApiName: 'Account',
    pageSize: 2,
    totalSize: 4,
    resolvedSoql: 'SELECT Id, Name FROM Account',
    baseWhere: '',
    finalWhere: '',
    queryFingerprint: 'fingerprint-stale',
    sourceRecords: [{ Id: '001' }, { Id: '002' }],
    expiresAt: new Date(Date.now() + 60_000),
  });

  await assert.rejects(
    () =>
      harness.service.getEntityList(user as never, 'account', {
        cursor: 'cursor-stale',
        pageSize: 2,
      } as never),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Invalid or expired entity cursor',
  );
});

test('getEntityRecord records query audit metadata and counters', async () => {
  const harness = createHarness({
    totalSize: 1,
    done: true,
    records: [{ Id: '001000000000001', Name: 'Acme' }],
  });
  const recordId = '001000000000001';

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      detail: {
        query: { object: 'Account' },
        sections: [],
      },
    }),
    filterVisibleDetailSections: () => [],
    collectDetailFieldNames: () => ['Id', 'Name'],
    ensureVisibleFields() {},
    resolveLookupProjectionFields: async () => [],
    buildSoqlFromQueryConfig: async () => ({
      soql: `SELECT Id, Name FROM Account WHERE Id = '${recordId}'`,
      baseWhere: `Id = '${recordId}'`,
      finalWhere: `(Id = '${recordId}') AND (OwnerId = '005000000000001')`,
      selectFields: ['Id', 'Name'],
    }),
    buildFieldDefinitions: async () => [],
    resolveDetailTitle: () => 'Acme',
    renderRecordTemplate: () => 'Detail subtitle',
  });

  const response = await harness.service.getEntityRecord(user as never, 'account', recordId);

  assert.equal(String(response.record.Id), recordId);
  assert.equal(harness.createCalls[0].queryKind, 'ENTITY_DETAIL');
  assert.equal(harness.createCalls[0].recordId, recordId);
  assert.deepEqual(harness.createCalls[0].metadata, {
    entityId: 'account',
    selectedFields: ['Id', 'Name'],
  });
  assert.equal(harness.completeCalls[0].rowCount, 1);
  assert.equal(harness.visibilityAuditCalls[0].rowCount, 1);
});

test('getEntityForm edit mode records query audit metadata and counters', async () => {
  const harness = createHarness({
    totalSize: 1,
    done: true,
    records: [{ Id: '001000000000001', Name: 'Acme' }],
  });
  const recordId = '001000000000001';

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      form: {
        title: {
          create: 'New Account',
          edit: 'Edit Account',
        },
        subtitle: 'Account form',
        query: { object: 'Account' },
        sections: [{ title: 'Main', fields: [{ field: 'Name' }] }],
      },
    }),
    resolveFormSections: () => [
      {
        title: 'Main',
        fields: [{ field: 'Name', label: 'Name', inputType: 'text', required: false }],
      },
    ],
    isFieldVisible: () => true,
    collectFormFieldNames: () => ['Name'],
    ensureVisibleFields() {},
    buildFormFieldDefinitions: async () => [],
    resolveLookupProjectionFields: async () => [],
    buildSoqlFromQueryConfig: async () => ({
      soql: `SELECT Id, Name FROM Account WHERE Id = '${recordId}'`,
      baseWhere: `Id = '${recordId}'`,
      finalWhere: `(Id = '${recordId}') AND (OwnerId = '005000000000001')`,
      selectFields: ['Id', 'Name'],
    }),
    renderRecordTemplate: () => 'Form subtitle',
  });

  const response = await harness.service.getEntityForm(user as never, 'account', recordId);

  assert.equal(String(response.record?.Id), recordId);
  assert.equal(harness.createCalls[0].queryKind, 'ENTITY_FORM');
  assert.deepEqual(harness.createCalls[0].metadata, {
    entityId: 'account',
    recordId,
    selectedFields: ['Id', 'Name'],
  });
  assert.equal(harness.completeCalls[0].rowCount, 1);
  assert.equal(harness.visibilityAuditCalls[0].rowCount, 1);
});

test('getEntityForm create mode derives runtime field metadata from Salesforce describe', async () => {
  const harness = createHarness({
    totalSize: 0,
    done: true,
    records: [],
  });

  (harness.service as unknown as {
    salesforceService: { describeObjectFields: (objectApiName: string) => Promise<unknown[]> };
  }).salesforceService.describeObjectFields = async (objectApiName: string) => {
    if (objectApiName === 'Account') {
      return [
        {
          name: 'Id',
          label: 'Record ID',
          type: 'id',
          nillable: false,
          createable: false,
          updateable: false,
          filterable: true,
          defaultedOnCreate: false,
          calculated: false,
          autoNumber: false,
        },
        {
          name: 'Name',
          label: 'Account Name',
          type: 'string',
          nillable: false,
          createable: true,
          updateable: true,
          filterable: true,
          defaultedOnCreate: false,
          calculated: false,
          autoNumber: false,
        },
        {
          name: 'Industry',
          label: 'Industry',
          type: 'picklist',
          nillable: true,
          createable: true,
          updateable: true,
          filterable: true,
          defaultedOnCreate: false,
          calculated: false,
          autoNumber: false,
          picklistValues: [
            { value: 'Technology', label: 'Technology', active: true, defaultValue: true },
            { value: 'Finance', label: 'Finance', active: true, defaultValue: false },
          ],
        },
        {
          name: 'OwnerId',
          label: 'Owner',
          type: 'reference',
          nillable: true,
          createable: true,
          updateable: true,
          filterable: true,
          defaultedOnCreate: false,
          calculated: false,
          autoNumber: false,
          relationshipName: 'Owner',
          referenceTo: ['User'],
        },
      ];
    }

    if (objectApiName === 'User') {
      return [
        {
          name: 'Name',
          label: 'Full Name',
          type: 'string',
          nillable: false,
          createable: false,
          updateable: false,
          filterable: true,
          defaultedOnCreate: false,
          calculated: false,
          autoNumber: false,
        },
      ];
    }

    return [];
  };

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      form: {
        title: {
          create: 'New Account',
          edit: 'Edit Account',
        },
        subtitle: 'Account form',
        query: { object: 'Account', fields: ['Id', 'Name', 'Industry', 'OwnerId'] },
        sections: [{ title: 'Main', fields: [{ field: 'Name' }, { field: 'Industry' }, { field: 'OwnerId' }] }],
      },
    }),
    isFieldVisible: () => true,
    ensureVisibleFields() {},
  });

  const response = await harness.service.getEntityForm(user as never, 'account');

  assert.deepEqual(
    response.sections[0]?.fields.map((field) => field.field),
    ['Name', 'Industry'],
  );
  assert.deepEqual(response.fieldDefinitions.map((field) => field.field), ['Name', 'Industry']);
  assert.equal(response.sections[0]?.fields[0]?.label, 'Account Name');
  assert.equal(response.sections[0]?.fields[0]?.required, true);
  assert.equal(response.sections[0]?.fields[1]?.inputType, 'select');
  assert.deepEqual(response.sections[0]?.fields[1]?.options, [
    { value: 'Technology', label: 'Technology', default: true },
    { value: 'Finance', label: 'Finance', default: undefined },
  ]);
  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.visibilityAuditCalls[0].queryKind, 'ENTITY_FORM');
});

test('getEntityForm edit mode projects lookup labels for reference fields', async () => {
  const harness = createHarness({
    totalSize: 1,
    done: true,
    records: [
      {
        Id: '001000000000001',
        Name: 'Acme',
        ParentId: '001000000000999',
        Parent: { Name: 'Global Parent' },
      },
    ],
  });
  const recordId = '001000000000001';
  const buildSoqlOptions: Array<Record<string, unknown>> = [];

  (harness.service as unknown as {
    salesforceService: { describeObjectFields: (objectApiName: string) => Promise<unknown[]> };
  }).salesforceService.describeObjectFields = async () => [
    {
      name: 'Id',
      label: 'Record ID',
      type: 'id',
      nillable: false,
      createable: false,
      updateable: false,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
    },
    {
      name: 'Name',
      label: 'Account Name',
      type: 'string',
      nillable: false,
      createable: true,
      updateable: true,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
    },
    {
      name: 'ParentId',
      label: 'Parent Account',
      type: 'reference',
      nillable: true,
      createable: true,
      updateable: true,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
      relationshipName: 'Parent',
      referenceTo: ['Account'],
    },
  ];

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      form: {
        title: {
          create: 'New Account',
          edit: 'Edit Account',
        },
        subtitle: 'Account form',
        query: { object: 'Account', fields: ['Id', 'Name', 'ParentId'] },
        sections: [{ title: 'Main', fields: [{ field: 'Name' }, { field: 'ParentId' }] }],
      },
    }),
    isFieldVisible: () => true,
    ensureVisibleFields() {},
    buildSoqlFromQueryConfig: async (_query: unknown, options: Record<string, unknown>) => {
      buildSoqlOptions.push(options);
      return {
        soql: `SELECT Id, Name, ParentId, Parent.Name FROM Account WHERE Id = '${recordId}'`,
        baseWhere: `Id = '${recordId}'`,
        finalWhere: `(Id = '${recordId}') AND (OwnerId = '005000000000001')`,
        selectFields: ['Id', 'Name', 'ParentId', 'Parent.Name'],
      };
    },
    renderRecordTemplate: () => 'Form subtitle',
  });

  const response = await harness.service.getEntityForm(user as never, 'account', recordId);

  assert.equal(String(response.record?.ParentId), '001000000000999');
  assert.equal(response.sections[0]?.fields[1]?.inputType, 'lookup');
  assert.deepEqual(response.sections[0]?.fields[1]?.lookup, {
    referenceTo: ['Account'],
    searchField: 'Name',
    where: undefined,
    orderBy: undefined,
    prefill: undefined,
  });
  assert.deepEqual(buildSoqlOptions[0].extraFields, ['Parent.Name']);
});

test('getEntityForm maps Salesforce datetime fields to datetime-local inputs', async () => {
  const harness = createHarness();

  (harness.service as unknown as {
    salesforceService: { describeObjectFields: (objectApiName: string) => Promise<unknown[]> };
  }).salesforceService.describeObjectFields = async () => [
    {
      name: 'Id',
      label: 'Record ID',
      type: 'id',
      nillable: false,
      createable: false,
      updateable: false,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
    },
    {
      name: 'CloseAt__c',
      label: 'Close At',
      type: 'datetime',
      nillable: false,
      createable: true,
      updateable: true,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
    },
  ];

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'opportunity',
      objectApiName: 'Opportunity',
      label: 'Opportunities',
      form: {
        title: {
          create: 'New Opportunity',
          edit: 'Edit Opportunity',
        },
        query: { object: 'Opportunity', fields: ['Id', 'CloseAt__c'] },
        sections: [{ title: 'Main', fields: [{ field: 'CloseAt__c' }] }],
      },
    }),
    isFieldVisible: () => true,
    ensureVisibleFields() {},
  });

  const response = await harness.service.getEntityForm(user as never, 'opportunity');

  assert.equal(response.sections[0]?.fields[0]?.field, 'CloseAt__c');
  assert.equal(response.sections[0]?.fields[0]?.inputType, 'datetime-local');
  assert.equal(response.fieldDefinitions[0]?.inputType, 'datetime-local');
  assert.equal(response.sections[0]?.fields[0]?.required, true);
});

test('getEntityForm maps time, url and encrypted string fields to dedicated inputs', async () => {
  const harness = createHarness();

  (harness.service as unknown as {
    salesforceService: { describeObjectFields: (objectApiName: string) => Promise<unknown[]> };
  }).salesforceService.describeObjectFields = async () => [
    {
      name: 'Id',
      label: 'Record ID',
      type: 'id',
      nillable: false,
      createable: false,
      updateable: false,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
    },
    {
      name: 'BestCallTime__c',
      label: 'Best Call Time',
      type: 'time',
      nillable: true,
      createable: true,
      updateable: true,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
    },
    {
      name: 'Website',
      label: 'Website',
      type: 'url',
      nillable: true,
      createable: true,
      updateable: true,
      filterable: true,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
    },
    {
      name: 'SecretCode__c',
      label: 'Secret Code',
      type: 'encryptedstring',
      nillable: true,
      createable: true,
      updateable: true,
      filterable: false,
      defaultedOnCreate: false,
      calculated: false,
      autoNumber: false,
    },
  ];

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      label: 'Accounts',
      form: {
        title: {
          create: 'New Account',
          edit: 'Edit Account',
        },
        query: { object: 'Account', fields: ['Id', 'BestCallTime__c', 'Website', 'SecretCode__c'] },
        sections: [{
          title: 'Main',
          fields: [{ field: 'BestCallTime__c' }, { field: 'Website' }, { field: 'SecretCode__c' }],
        }],
      },
    }),
    isFieldVisible: () => true,
    ensureVisibleFields() {},
  });

  const response = await harness.service.getEntityForm(user as never, 'account');

  assert.equal(response.sections[0]?.fields[0]?.inputType, 'time');
  assert.equal(response.sections[0]?.fields[1]?.inputType, 'url');
  assert.equal(response.sections[0]?.fields[2]?.inputType, 'password');
  assert.equal(response.fieldDefinitions[0]?.inputType, 'time');
  assert.equal(response.fieldDefinitions[1]?.inputType, 'url');
  assert.equal(response.fieldDefinitions[2]?.inputType, 'password');
});

test('searchEntityFormLookup returns describe-driven lookup options', async () => {
  const harness = createHarness({
    totalSize: 1,
    done: true,
    records: [{ Id: '005000000000001', Name: 'Mario Rossi', Username: 'mario@example.com' }],
  });

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      form: {
        title: { create: 'New', edit: 'Edit' },
        query: { object: 'Account', fields: ['Id'] },
        sections: [
          {
            title: 'Main',
            fields: [
              {
                field: 'OwnerCustom__c',
                lookup: {
                  searchField: 'Username',
                },
              },
            ],
          },
        ],
      },
    }),
    getDescribeFieldMap: async (objectApiName: string) =>
      new Map(
        objectApiName === 'Account'
          ? [
              [
                'OwnerCustom__c',
                {
                  name: 'OwnerCustom__c',
                  label: 'Owner',
                  type: 'reference',
                  nillable: true,
                  createable: true,
                  updateable: true,
                  filterable: true,
                  defaultedOnCreate: false,
                  calculated: false,
                  autoNumber: false,
                  relationshipName: 'OwnerCustom__r',
                  referenceTo: ['User'],
                },
              ],
            ]
          : [
              [
                'Username',
                {
                  name: 'Username',
                  label: 'Username',
                  type: 'string',
                  nillable: false,
                  createable: false,
                  updateable: false,
                  filterable: true,
                  defaultedOnCreate: false,
                  calculated: false,
                  autoNumber: false,
                },
              ],
              [
                'Name',
                {
                  name: 'Name',
                  label: 'Full Name',
                  type: 'string',
                  nillable: false,
                  createable: false,
                  updateable: false,
                  filterable: true,
                  defaultedOnCreate: false,
                  calculated: false,
                  autoNumber: false,
                },
              ],
            ],
      ),
    buildSoqlFromQueryConfig: async () => ({
      soql: "SELECT Id, Name, Username FROM User WHERE Username LIKE '%mario%'",
      baseWhere: "Username LIKE '%mario%'",
      finalWhere: "(Username LIKE '%mario%') AND (OwnerId = '005000000000001')",
      selectFields: ['Id', 'Name', 'Username'],
    }),
    isFieldVisible: () => true,
  });

  const response = await harness.service.searchEntityFormLookup(user as never, 'account', 'OwnerCustom__c', {
    q: 'mario',
    recordTypeDeveloperName: 'Retail',
  });

  assert.deepEqual(response.items, [
    {
      id: '005000000000001',
      label: 'Mario Rossi',
      objectApiName: 'User',
      subtitle: 'mario@example.com',
    },
  ]);
  assert.equal(harness.createCalls[0].queryKind, 'ENTITY_FORM_LOOKUP');
});

test('getEntityRelatedList records query audit metadata and counters', async () => {
  const harness = createHarness({
    totalSize: 2,
    done: true,
    records: [{ Id: '003000000000001', Name: 'Jane' }, { Id: '003000000000002', Name: 'John' }],
  });
  const recordId = '001000000000001';
  const relatedList = {
    id: 'contacts',
    label: 'Contacts',
    columns: ['Name'],
    query: { object: 'Contact' },
  };

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
      detail: {
        relatedLists: [relatedList],
      },
    }),
    filterVisibleColumns: () => ['Name'],
    extractColumnFieldPaths: () => ['Name'],
    ensureVisibleFields() {},
    resolveLookupProjectionFields: async () => [],
    buildSoqlFromQueryConfig: async () => ({
      soql: `SELECT Id, Name FROM Contact WHERE AccountId = '${recordId}'`,
      baseWhere: `AccountId = '${recordId}'`,
      finalWhere: `(AccountId = '${recordId}') AND (OwnerId = '005000000000001')`,
      selectFields: ['Id', 'Name'],
    }),
  });

  const response = await harness.service.getEntityRelatedList(
    user as never,
    'account',
    'contacts',
    {
      recordId,
      pageSize: 20,
    },
  );

  assert.equal(response.records.length, 2);
  assert.equal(response.nextCursor, null);
  assert.equal(harness.createCalls[0].queryKind, 'ENTITY_RELATED_LIST');
  assert.deepEqual(harness.createCalls[0].metadata, {
    entityId: 'account',
    relatedListId: 'contacts',
    recordId,
    pageSize: 20,
    selectedFields: ['Id', 'Name'],
    paginationMode: 'cursor',
    cursorPhase: 'initial',
  });
  assert.equal(harness.completeCalls[0].rowCount, 2);
  assert.equal(harness.visibilityAuditCalls[0].rowCount, 2);
});

function createWriteHarness(options?: {
  authorizeError?: Error;
  readResults?: unknown[];
  visibility?: Record<string, unknown>;
  createResult?: Record<string, unknown>;
  updateResult?: Record<string, unknown>;
}) {
  const queryCreateCalls: Array<Record<string, unknown>> = [];
  const queryCompleteCalls: Array<Record<string, unknown>> = [];
  const applicationIntentCalls: Array<Record<string, unknown>> = [];
  const applicationCompleteCalls: Array<Record<string, unknown>> = [];
  const visibilityAuditCalls: Array<Record<string, unknown>> = [];
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const readOnlyQueryCalls: string[] = [];
  const createRecordCalls: Array<Record<string, unknown>> = [];
  const updateRecordCalls: Array<Record<string, unknown>> = [];
  const deleteRecordCalls: Array<Record<string, unknown>> = [];
  const readResultsQueue = [...(options?.readResults ?? [])];

  const visibility = {
    contactId: '003000000000001',
    permissionsHash: 'perm-hash',
    recordType: null,
    objectApiName: 'Account',
    appliedCones: ['sales'],
    appliedRules: ['rule-1'],
    decision: 'ALLOW',
    reasonCode: 'ALLOW_MATCH',
    policyVersion: 7,
    objectPolicyVersion: 3,
    compiledPredicate: "OwnerId = '005000000000001'",
    compiledFields: ['Id', 'Name'],
    deniedFields: [],
    baseWhere: '',
    finalWhere: '',
    ...(options?.visibility ?? {}),
  };

  const auditWriteService = {
    async createQueryAuditIntentOrThrow(input: Record<string, unknown>) {
      queryCreateCalls.push(input);
      return BigInt(queryCreateCalls.length);
    },
    async completeQueryAuditOrThrow(input: Record<string, unknown>) {
      queryCompleteCalls.push(input);
    },
    async createApplicationIntentOrThrow(input: Record<string, unknown>) {
      applicationIntentCalls.push(input);
      return BigInt(1000 + applicationIntentCalls.length);
    },
    async completeApplicationAuditOrThrow(input: Record<string, unknown>) {
      applicationCompleteCalls.push(input);
    },
    normalizeErrorCode() {
      return 'MUTATION_FAILED';
    },
  };

  const salesforceService = {
    async executeReadOnlyQuery(soql: string) {
      readOnlyQueryCalls.push(soql);
      return readResultsQueue.shift() ?? { totalSize: 1, done: true, records: [{ Id: '001000000000001' }] };
    },
    async createRecord(objectApiName: string, values: Record<string, unknown>) {
      createRecordCalls.push({ objectApiName, values });
      return options?.createResult ?? { id: '001000000000001', success: true };
    },
    async updateRecord(objectApiName: string, recordId: string, values: Record<string, unknown>) {
      updateRecordCalls.push({ objectApiName, recordId, values });
      return options?.updateResult ?? { id: recordId, success: true };
    },
    async deleteRecord(objectApiName: string, recordId: string) {
      deleteRecordCalls.push({ objectApiName, recordId });
    },
  };

  const visibilityService = {
    async recordAudit(input: Record<string, unknown>) {
      visibilityAuditCalls.push(input);
    },
  };

  const queryAuditService = new QueryAuditService(
    auditWriteService as never,
    salesforceService as never,
    visibilityService as never,
  );

  const resourceAccessService = {
    assertEntityId() {},
    async authorizeObjectAccess(
      currentUser: Record<string, unknown>,
      aclResourceId: string,
      objectApiName: string,
      auditContext: Record<string, unknown>,
    ) {
      authorizeCalls.push({
        user: currentUser,
        aclResourceId,
        objectApiName,
        auditContext,
      });

      if (options?.authorizeError) {
        throw options.authorizeError;
      }

      return visibility;
    },
  };

  const entityLayoutResolverService = {
    async resolveRecordTypeDeveloperName() {
      return undefined;
    },
    async listCreateOptions() {
      return { items: [], recordTypeSelectionRequired: false };
    },
    resolveLayout(entityConfig: Record<string, unknown>, _user: Record<string, unknown>, capability: 'detail' | 'form') {
      const layouts = Array.isArray(entityConfig.layouts) ? entityConfig.layouts : [];
      const layoutFromConfig = layouts.find((entry) =>
        capability === 'detail' ? Boolean((entry as { detail?: unknown }).detail) : Boolean((entry as { form?: unknown }).form),
      );
      if (layoutFromConfig) {
        return {
          layout: layoutFromConfig,
          layoutId: String((layoutFromConfig as { id?: string }).id ?? 'default'),
          recordTypeDeveloperName: undefined,
        };
      }

      const synthesizedLayout = {
        id: 'default',
        label: 'Default',
        detail: entityConfig.detail,
        form: entityConfig.form,
        assignments: [],
        isDefault: true,
      };

      return {
        layout: synthesizedLayout,
        layoutId: synthesizedLayout.id,
        recordTypeDeveloperName: undefined,
      };
    },
  };

  const service = new EntitiesService(
    auditWriteService as never,
    queryAuditService,
    resourceAccessService as never,
    {
      async getEntityConfig() {
        return {};
      },
    } as never,
    entityLayoutResolverService as never,
    {
      async createCursor() {
        return 'cursor-1';
      },
      async readCursor() {
        throw new Error('cursor read not implemented in write harness');
      },
      async deleteExpiredCursors() {},
      hashFingerprint(parts: unknown[]) {
        return JSON.stringify(parts);
      },
    } as never,
    salesforceService as never,
    visibilityService as never,
  );

  return {
    service,
    queryCreateCalls,
    queryCompleteCalls,
    applicationIntentCalls,
    applicationCompleteCalls,
    visibilityAuditCalls,
    authorizeCalls,
    readOnlyQueryCalls,
    createRecordCalls,
    updateRecordCalls,
    deleteRecordCalls,
  };
}

test('createEntityRecord denies before mutation when authorizeObjectAccess fails', async () => {
  const harness = createWriteHarness({
    authorizeError: new ForbiddenException('ACL denied entity:account'),
  });

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
    }),
  });

  await assert.rejects(
    harness.service.createEntityRecord(user as never, 'account', { Name: 'Acme' }),
    /ACL denied entity:account/,
  );

  assert.equal(harness.applicationIntentCalls.length, 0);
  assert.equal(harness.createRecordCalls.length, 0);
  assert.equal(harness.visibilityAuditCalls.length, 0);
});

test('createEntityRecord records visibility audit before application audit and mutation', async () => {
  const harness = createWriteHarness();

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
    }),
    normalizeWritePayload: async () => ({
      Name: 'Acme',
    }),
  });

  const response = await harness.service.createEntityRecord(user as never, 'account', { Name: 'Acme' });

  assert.equal(String(response.id), '001000000000001');
  assert.deepEqual(harness.authorizeCalls[0], {
    user,
    aclResourceId: 'entity:account',
    objectApiName: 'Account',
    auditContext: {
      queryKind: 'ENTITY_CREATE',
    },
  });
  assert.equal(harness.visibilityAuditCalls.length, 1);
  assert.equal(harness.visibilityAuditCalls[0].queryKind, 'ENTITY_CREATE');
  assert.equal(harness.visibilityAuditCalls[0].rowCount, 0);
  assert.equal(harness.applicationIntentCalls.length, 1);
  assert.equal(harness.applicationIntentCalls[0].action, 'ENTITY_CREATE');
  assert.deepEqual(harness.createRecordCalls, [
    {
      objectApiName: 'Account',
      values: { Name: 'Acme' },
    },
  ]);
});

test('updateEntityRecord denies before preflight when authorizeObjectAccess fails', async () => {
  const harness = createWriteHarness({
    authorizeError: new ForbiddenException('Visibility denied'),
  });
  const recordId = '001000000000001';

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
    }),
  });

  await assert.rejects(
    harness.service.updateEntityRecord(user as never, 'account', recordId, { Name: 'Acme' }),
    /Visibility denied/,
  );

  assert.equal(harness.readOnlyQueryCalls.length, 0);
  assert.equal(harness.applicationIntentCalls.length, 0);
  assert.equal(harness.updateRecordCalls.length, 0);
});

test('updateEntityRecord returns not found when preflight scoped query finds no rows', async () => {
  const harness = createWriteHarness({
    readResults: [{ totalSize: 0, done: true, records: [] }],
  });
  const recordId = '001000000000001';

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
    }),
  });

  await assert.rejects(
    harness.service.updateEntityRecord(user as never, 'account', recordId, { Name: 'Acme' }),
    /Record 001000000000001 not found/,
  );

  assert.equal(harness.queryCreateCalls.length, 1);
  assert.equal(harness.queryCreateCalls[0].queryKind, 'ENTITY_UPDATE_PREFLIGHT');
  assert.equal(harness.queryCreateCalls[0].recordId, recordId);
  assert.deepEqual(harness.queryCreateCalls[0].metadata, {
    entityId: 'account',
    operation: 'update',
    selectedFields: ['Id'],
  });
  assert.equal(harness.applicationIntentCalls.length, 0);
  assert.equal(harness.updateRecordCalls.length, 0);
  assert.equal(harness.visibilityAuditCalls.length, 1);
  assert.equal(harness.visibilityAuditCalls[0].queryKind, 'ENTITY_UPDATE_PREFLIGHT');
});

test('updateEntityRecord runs preflight audit and final mutation audits when the record is in scope', async () => {
  const harness = createWriteHarness({
    readResults: [{ totalSize: 1, done: true, records: [{ Id: '001000000000001' }] }],
  });
  const recordId = '001000000000001';

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
    }),
    normalizeWritePayload: async () => ({
      Name: 'Acme Updated',
    }),
  });

  const response = await harness.service.updateEntityRecord(user as never, 'account', recordId, {
    Name: 'Acme Updated',
  });

  assert.equal(String(response.id), recordId);
  assert.equal(harness.queryCreateCalls[0].queryKind, 'ENTITY_UPDATE_PREFLIGHT');
  assert.match(
    harness.readOnlyQueryCalls[0],
    /SELECT Id FROM Account WHERE \(Id = '001000000000001'\) AND \(OwnerId = '005000000000001'\) LIMIT 1/,
  );
  assert.equal(harness.visibilityAuditCalls.length, 2);
  assert.equal(harness.visibilityAuditCalls[0].queryKind, 'ENTITY_UPDATE_PREFLIGHT');
  assert.equal(harness.visibilityAuditCalls[1].queryKind, 'ENTITY_UPDATE');
  assert.equal(harness.applicationIntentCalls.length, 1);
  assert.equal(harness.applicationIntentCalls[0].action, 'ENTITY_UPDATE');
  assert.deepEqual(harness.updateRecordCalls, [
    {
      objectApiName: 'Account',
      recordId,
      values: { Name: 'Acme Updated' },
    },
  ]);
});

test('deleteEntityRecord returns not found when preflight scoped query finds no rows', async () => {
  const harness = createWriteHarness({
    readResults: [{ totalSize: 0, done: true, records: [] }],
  });
  const recordId = '001000000000001';

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
    }),
  });

  await assert.rejects(
    harness.service.deleteEntityRecord(user as never, 'account', recordId),
    /Record 001000000000001 not found/,
  );

  assert.equal(harness.queryCreateCalls.length, 1);
  assert.equal(harness.queryCreateCalls[0].queryKind, 'ENTITY_DELETE_PREFLIGHT');
  assert.equal(harness.applicationIntentCalls.length, 0);
  assert.equal(harness.deleteRecordCalls.length, 0);
  assert.equal(harness.visibilityAuditCalls.length, 1);
  assert.equal(harness.visibilityAuditCalls[0].queryKind, 'ENTITY_DELETE_PREFLIGHT');
});

test('deleteEntityRecord runs preflight audit and final mutation audits when the record is in scope', async () => {
  const harness = createWriteHarness({
    readResults: [{ totalSize: 1, done: true, records: [{ Id: '001000000000001' }] }],
  });
  const recordId = '001000000000001';

  patchServiceMethods(harness.service, {
    loadEntityConfig: async () => ({
      id: 'account',
      objectApiName: 'Account',
    }),
  });

  await harness.service.deleteEntityRecord(user as never, 'account', recordId);

  assert.equal(harness.queryCreateCalls[0].queryKind, 'ENTITY_DELETE_PREFLIGHT');
  assert.equal(harness.visibilityAuditCalls.length, 2);
  assert.equal(harness.visibilityAuditCalls[0].queryKind, 'ENTITY_DELETE_PREFLIGHT');
  assert.equal(harness.visibilityAuditCalls[1].queryKind, 'ENTITY_DELETE');
  assert.equal(harness.applicationIntentCalls.length, 1);
  assert.equal(harness.applicationIntentCalls[0].action, 'ENTITY_DELETE');
  assert.deepEqual(harness.deleteRecordCalls, [
    {
      objectApiName: 'Account',
      recordId,
    },
  ]);
});
