import assert from 'node:assert/strict';
import test from 'node:test';

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
