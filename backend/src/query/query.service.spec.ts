import assert from 'node:assert/strict';
import test from 'node:test';

import { QueryAuditService } from '../audit/query-audit.service';

import { QueryService } from './query.service';

function createHarness(resultOrError: unknown) {
  const createCalls: Array<Record<string, unknown>> = [];
  const completeCalls: Array<Record<string, unknown>> = [];
  const visibilityAuditCalls: Array<Record<string, unknown>> = [];
  const soqlCalls: string[] = [];

  const auditWriteService = {
    async createQueryAuditIntentOrThrow(input: Record<string, unknown>) {
      createCalls.push(input);
      return 81n;
    },
    async completeQueryAuditOrThrow(input: Record<string, unknown>) {
      completeCalls.push(input);
    },
    normalizeErrorCode() {
      return 'QUERY_FAILED';
    },
  };

  const salesforceService = {
    async executeReadOnlyQuery(soql: string) {
      soqlCalls.push(soql);

      if (resultOrError instanceof Error) {
        throw resultOrError;
      }

      return resultOrError;
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

  const template = {
    id: 'account-pipeline',
    objectApiName: 'Account',
    soql: 'SELECT Id FROM Account LIMIT {{limit}}',
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

  const resourceAccessService = {
    assertKebabCaseId() {},
    async authorizeObjectAccess() {
      return visibility;
    },
  };

  const queryTemplateRepository = {
    async getTemplate() {
      return template;
    },
  };

  const queryTemplateCompiler = {
    compile() {
      return 'SELECT Id FROM Account LIMIT 10';
    },
    scopeCompiledSoql() {
      return {
        soql: "SELECT Id, Name FROM Account WHERE (IsActive = TRUE) AND (OwnerId = '005000000000001')",
        baseWhere: 'IsActive = TRUE',
        finalWhere: "(IsActive = TRUE) AND (OwnerId = '005000000000001')",
        selectedFields: ['Id', 'Name'],
      };
    },
  };

  const service = new QueryService(
    queryAuditService,
    resourceAccessService as never,
    queryTemplateRepository as never,
    queryTemplateCompiler as never,
  );

  return {
    service,
    createCalls,
    completeCalls,
    soqlCalls,
    visibilityAuditCalls,
    visibility,
  };
}

test('executeTemplate records query audit success and visibility audit', async () => {
  const harness = createHarness({
    totalSize: 2,
    done: true,
    records: [{ Id: '001' }, { Id: '002' }],
  });

  const response = (await harness.service.executeTemplate(
    {
      sub: '003000000000001',
      email: 'user@example.com',
      permissions: ['PORTAL_USER'],
    },
    'account-pipeline',
    { limit: 10 },
  )) as { soql: string };

  assert.equal(harness.createCalls.length, 1);
  assert.equal(harness.createCalls[0].queryKind, 'QUERY_TEMPLATE');
  assert.equal(harness.createCalls[0].targetId, 'account-pipeline');
  assert.deepEqual(harness.createCalls[0].metadata, {
    templateId: 'account-pipeline',
    params: { limit: 10 },
    selectedFields: ['Id', 'Name'],
  });
  assert.equal(harness.soqlCalls[0], response.soql);
  assert.equal(harness.completeCalls.length, 1);
  assert.equal(harness.completeCalls[0].status, 'SUCCESS');
  assert.equal(harness.completeCalls[0].rowCount, 2);
  assert.ok(Number(harness.completeCalls[0].durationMs) >= 0);
  assert.equal(harness.visibilityAuditCalls.length, 1);
  assert.equal(harness.visibilityAuditCalls[0].rowCount, 2);
});

test('executeTemplate records query audit failure and preserves the error', async () => {
  const harness = createHarness(new Error('Salesforce boom'));

  await assert.rejects(
    () =>
      harness.service.executeTemplate(
        {
          sub: '003000000000001',
          email: 'user@example.com',
          permissions: ['PORTAL_USER'],
        },
        'account-pipeline',
        { limit: 10 },
      ),
    /Salesforce boom/,
  );

  assert.equal(harness.completeCalls.length, 1);
  assert.equal(harness.completeCalls[0].status, 'FAILURE');
  assert.equal(harness.completeCalls[0].errorCode, 'QUERY_FAILED');
  assert.equal(harness.visibilityAuditCalls.length, 1);
  assert.equal(harness.visibilityAuditCalls[0].rowCount, 0);
});
