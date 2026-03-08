import assert from 'node:assert/strict';
import test from 'node:test';

import { ForbiddenException } from '@nestjs/common';

import { QueryAuditService } from '../audit/query-audit.service';

import { EntitiesService } from './entities.service';

function createHarness(rawResult: Record<string, unknown>) {
  const createCalls: Array<Record<string, unknown>> = [];
  const completeCalls: Array<Record<string, unknown>> = [];
  const visibilityAuditCalls: Array<Record<string, unknown>> = [];

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
    async authorizeObjectAccess() {
      return visibility;
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
    salesforceService as never,
    visibilityService as never,
  );

  return {
    service,
    createCalls,
    completeCalls,
    visibilityAuditCalls,
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
    page: 2,
    pageSize: 10,
    search: 'Acme',
  } as never);

  assert.equal(response.records.length, 2);
  assert.equal(harness.createCalls.length, 1);
  assert.equal(harness.createCalls[0].queryKind, 'ENTITY_LIST');
  assert.equal(harness.createCalls[0].targetId, 'account');
  assert.deepEqual(harness.createCalls[0].metadata, {
    entityId: 'account',
    viewId: 'pipeline',
    page: 2,
    pageSize: 10,
    search: 'Acme',
    selectedFields: ['Id', 'Name'],
  });
  assert.equal(harness.completeCalls[0].status, 'SUCCESS');
  assert.equal(harness.completeCalls[0].rowCount, 2);
  assert.ok(Number(harness.completeCalls[0].durationMs) >= 0);
  assert.equal(harness.visibilityAuditCalls[0].rowCount, 2);
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
    buildFieldDefinitions: async () => [],
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
      page: 3,
      pageSize: 20,
    },
  );

  assert.equal(response.records.length, 2);
  assert.equal(harness.createCalls[0].queryKind, 'ENTITY_RELATED_LIST');
  assert.deepEqual(harness.createCalls[0].metadata, {
    entityId: 'account',
    relatedListId: 'contacts',
    recordId,
    page: 3,
    pageSize: 20,
    selectedFields: ['Id', 'Name'],
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

  const service = new EntitiesService(
    auditWriteService as never,
    queryAuditService,
    resourceAccessService as never,
    {
      async getEntityConfig() {
        return {};
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
