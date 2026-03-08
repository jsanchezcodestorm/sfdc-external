import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { VisibilityAdminService } from './visibility-admin.service';
import type { VisibilityEvaluation } from './visibility.types';

const CONTACT_ID = '003000000000001AAA';

function createEvaluation(
  overrides: Partial<VisibilityEvaluation> = {},
): VisibilityEvaluation {
  return {
    decision: 'ALLOW',
    reasonCode: 'ALLOW_MATCH',
    policyVersion: 9,
    objectPolicyVersion: 4,
    objectApiName: 'Account',
    contactId: CONTACT_ID,
    recordType: 'administration',
    appliedCones: ['TEST'],
    appliedRules: ['rule-1'],
    matchedAssignments: ['assignment-1'],
    permissionsHash: 'permissions-hash',
    compiledPredicate: "Type = 'Customer'",
    compiledAllowPredicate: "Type = 'Customer'",
    baseWhere: "Status__c = 'Active'",
    finalWhere: "(Status__c = 'Active') AND (Type = 'Customer')",
    ...overrides,
  };
}

function createVisibilityAdminService(options?: {
  evaluation?: VisibilityEvaluation;
  applyFieldVisibility?: (fields: string[], evaluation: VisibilityEvaluation) => string[];
  prisma?: Record<string, unknown>;
  queryResult?: unknown;
}) {
  const evaluateCalls: Array<Record<string, unknown>> = [];
  const applyFieldVisibilityCalls: Array<Record<string, unknown>> = [];
  const recordAuditCalls: Array<Record<string, unknown>> = [];
  const queryCalls: string[] = [];

  const visibilityService = {
    async evaluate(input: Record<string, unknown>) {
      evaluateCalls.push(input);
      return options?.evaluation ?? createEvaluation();
    },
    applyFieldVisibility(fields: string[], evaluation: VisibilityEvaluation) {
      applyFieldVisibilityCalls.push({ fields, evaluation });
      return options?.applyFieldVisibility
        ? options.applyFieldVisibility(fields, evaluation)
        : fields;
    },
    async recordAudit(input: Record<string, unknown>) {
      recordAuditCalls.push(input);
    },
  };

  const salesforceService = {
    async executeReadOnlyQuery(soql: string) {
      queryCalls.push(soql);
      return options?.queryResult ?? { records: [] };
    },
  };

  const service = new VisibilityAdminService(
    (options?.prisma ?? {}) as never,
    visibilityService as never,
    salesforceService as never,
  );

  return {
    service,
    calls: {
      evaluateCalls,
      applyFieldVisibilityCalls,
      recordAuditCalls,
      queryCalls,
    },
  };
}

function createInvalidationHarness() {
  const policyMetaUpsertCalls: Array<Record<string, unknown>> = [];
  const objectVersionUpsertCalls: Array<Record<string, unknown>> = [];
  const userScopeDeleteManyCalls: Array<Record<string, unknown>> = [];
  const definitionDeleteManyCalls: Array<Record<string, unknown>> = [];

  const service = new VisibilityAdminService(
    {} as never,
    {} as never,
    {} as never,
  );

  const tx = {
    visibilityPolicyMeta: {
      async upsert(input: Record<string, unknown>) {
        policyMetaUpsertCalls.push(input);
      },
    },
    visibilityObjectPolicyVersion: {
      async upsert(input: Record<string, unknown>) {
        objectVersionUpsertCalls.push(input);
      },
    },
    visibilityUserScopeCache: {
      async deleteMany(input: Record<string, unknown>) {
        userScopeDeleteManyCalls.push(input);
      },
    },
    visibilityPolicyDefinitionCache: {
      async deleteMany(input: Record<string, unknown>) {
        definitionDeleteManyCalls.push(input);
      },
    },
  };

  return {
    service,
    tx,
    calls: {
      definitionDeleteManyCalls,
      objectVersionUpsertCalls,
      policyMetaUpsertCalls,
      userScopeDeleteManyCalls,
    },
  };
}

test('previewDebug executes a scoped query and flattens preview records', async () => {
  const { service, calls } = createVisibilityAdminService({
    applyFieldVisibility: (fields) => fields.filter((field) => field !== 'Secret__c'),
    queryResult: {
      records: [
        {
          Name: 'Acme',
          Owner: { Name: 'Jane Doe' },
          attributes: { type: 'Account' },
        },
        {
          Name: 'Globex',
          Owner: null,
        },
      ],
    },
  });

  const response = await service.previewDebug({
    objectApiName: 'Account',
    contactId: CONTACT_ID,
    permissions: ['portal_admin', 'PORTAL_ADMIN'],
    recordType: 'administration',
    baseWhere: "Status__c = 'Active'",
    requestedFields: ['Name', 'Owner.Name', 'Secret__c'],
    limit: 5,
  });

  assert.equal(calls.evaluateCalls.length, 1);
  assert.equal(calls.applyFieldVisibilityCalls.length, 1);
  assert.deepEqual(calls.evaluateCalls[0].permissions, ['PORTAL_ADMIN']);
  assert.equal(calls.queryCalls.length, 1);
  assert.equal(
    calls.queryCalls[0],
    "SELECT Name, Owner.Name FROM Account WHERE (Status__c = 'Active') AND (Type = 'Customer') ORDER BY Id ASC LIMIT 5",
  );
  assert.equal(response.executed, true);
  assert.equal(response.rowCount, 2);
  assert.equal(response.visibility.rowCount, 2);
  assert.deepEqual(response.selectedFields, ['Name', 'Owner.Name']);
  assert.deepEqual(response.records, [
    {
      Name: 'Acme',
      'Owner.Name': 'Jane Doe',
    },
    {
      Name: 'Globex',
      'Owner.Name': null,
    },
  ]);
  assert.equal(calls.recordAuditCalls.length, 1);
  assert.equal(calls.recordAuditCalls[0].queryKind, 'VISIBILITY_DEBUG_PREVIEW');
  assert.equal(calls.recordAuditCalls[0].rowCount, 2);
});

test('previewDebug skips execution and audits when visibility denies access', async () => {
  const { service, calls } = createVisibilityAdminService({
    evaluation: createEvaluation({
      decision: 'DENY',
      reasonCode: 'NO_ALLOW_RULE',
      compiledPredicate: undefined,
      compiledAllowPredicate: undefined,
      finalWhere: "Status__c = 'Active'",
    }),
  });

  const response = await service.previewDebug({
    objectApiName: 'Account',
    contactId: CONTACT_ID,
    permissions: ['PORTAL_ADMIN'],
    requestedFields: ['Name'],
  });

  assert.equal(response.executed, false);
  assert.equal(response.executionSkippedReason, 'VISIBILITY_DENY');
  assert.equal(response.rowCount, 0);
  assert.equal(response.visibility.rowCount, 0);
  assert.equal(calls.queryCalls.length, 0);
  assert.equal(calls.recordAuditCalls.length, 1);
  assert.equal(calls.recordAuditCalls[0].rowCount, 0);
});

test('previewDebug skips execution when no requested fields remain visible', async () => {
  const { service, calls } = createVisibilityAdminService({
    applyFieldVisibility: () => [],
  });

  const response = await service.previewDebug({
    objectApiName: 'Account',
    contactId: CONTACT_ID,
    permissions: ['PORTAL_ADMIN'],
    requestedFields: ['Secret__c'],
  });

  assert.equal(response.executed, false);
  assert.equal(response.executionSkippedReason, 'NO_VISIBLE_FIELDS');
  assert.equal(response.rowCount, 0);
  assert.deepEqual(response.selectedFields, []);
  assert.equal(calls.queryCalls.length, 0);
  assert.equal(calls.recordAuditCalls.length, 1);
});

test('previewDebug validates requestedFields and limit', async () => {
  const { service } = createVisibilityAdminService();

  await assert.rejects(
    () =>
      service.previewDebug({
        objectApiName: 'Account',
        contactId: CONTACT_ID,
        permissions: ['PORTAL_ADMIN'],
        requestedFields: [],
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'requestedFields must be a non-empty array',
  );

  await assert.rejects(
    () =>
      service.previewDebug({
        objectApiName: 'Account',
        contactId: CONTACT_ID,
        permissions: ['PORTAL_ADMIN'],
        requestedFields: ['Name'],
        limit: 26,
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'limit must be an integer between 1 and 25',
  );
});

test('targeted invalidation increments global and object versions and deletes only affected caches', async () => {
  const { service, tx, calls } = createInvalidationHarness();

  await (
    service as unknown as {
      bumpPolicyVersionAndInvalidateCaches(
        tx: Record<string, unknown>,
        affectedObjectApiNames: Array<string | undefined>,
      ): Promise<void>;
    }
  ).bumpPolicyVersionAndInvalidateCaches(tx as never, ['Account', undefined, 'Contact', 'Account']);

  assert.equal(calls.policyMetaUpsertCalls.length, 1);
  assert.equal(calls.objectVersionUpsertCalls.length, 2);
  assert.deepEqual(
    calls.objectVersionUpsertCalls.map((entry) => (entry.where as Record<string, string>).objectApiName),
    ['Account', 'Contact'],
  );
  assert.deepEqual(
    ((calls.userScopeDeleteManyCalls[0].where as Record<string, unknown>).objectApiName as Record<
      string,
      string[]
    >).in,
    ['Account', 'Contact'],
  );
  assert.deepEqual(
    ((calls.definitionDeleteManyCalls[0].where as Record<string, unknown>).objectApiName as Record<
      string,
      string[]
    >).in,
    ['Account', 'Contact'],
  );
});

test('targeted invalidation with no affected objects only bumps global policy version', async () => {
  const { service, tx, calls } = createInvalidationHarness();

  await (
    service as unknown as {
      bumpPolicyVersionAndInvalidateCaches(
        tx: Record<string, unknown>,
        affectedObjectApiNames: Array<string | undefined>,
      ): Promise<void>;
    }
  ).bumpPolicyVersionAndInvalidateCaches(tx as never, []);

  assert.equal(calls.policyMetaUpsertCalls.length, 1);
  assert.equal(calls.objectVersionUpsertCalls.length, 0);
  assert.equal(calls.userScopeDeleteManyCalls.length, 0);
  assert.equal(calls.definitionDeleteManyCalls.length, 0);
});

test('normalizeRule keeps a trimmed optional description and drops whitespace-only values', async () => {
  const prisma = {
    visibilityCone: {
      async findUnique() {
        return { id: 'ddcf4148-5230-45ea-97e0-741417507a85' };
      },
    },
  };
  const { service } = createVisibilityAdminService({ prisma });

  const normalizeRule = service as unknown as {
    normalizeRule(ruleId: string | undefined, value: unknown): Promise<Record<string, unknown>>;
  };

  const normalizedWithDescription = await normalizeRule.normalizeRule(undefined, {
    coneId: 'ddcf4148-5230-45ea-97e0-741417507a85',
    objectApiName: 'Account',
    description: '  Regola per account attivi  ',
    effect: 'ALLOW',
    condition: {
      field: 'Status__c',
      op: '=',
      value: 'Active',
    },
    active: true,
  });

  assert.equal(normalizedWithDescription.description, 'Regola per account attivi');

  const normalizedWithoutDescription = await normalizeRule.normalizeRule(undefined, {
    coneId: 'ddcf4148-5230-45ea-97e0-741417507a85',
    objectApiName: 'Account',
    description: '   ',
    effect: 'ALLOW',
    condition: {
      field: 'Status__c',
      op: '=',
      value: 'Active',
    },
    active: true,
  });

  assert.equal(normalizedWithoutDescription.description, undefined);
});

test('listRules includes optional description in summary responses', async () => {
  const prisma = {
    visibilityRule: {
      async findMany() {
        return [
          {
            id: 'rule-1',
            coneId: 'cone-1',
            objectApiName: 'Account',
            description: 'Regola account attivi',
            effect: 'ALLOW',
            active: true,
            fieldsAllowed: ['Name'],
            fieldsDenied: null,
            updatedAt: new Date('2026-03-08T12:00:00.000Z'),
            cone: {
              code: 'commercial',
            },
          },
          {
            id: 'rule-2',
            coneId: 'cone-1',
            objectApiName: 'Account',
            description: null,
            effect: 'DENY',
            active: false,
            fieldsAllowed: null,
            fieldsDenied: ['Secret__c'],
            updatedAt: new Date('2026-03-08T12:05:00.000Z'),
            cone: {
              code: 'commercial',
            },
          },
        ];
      },
    },
  };
  const { service } = createVisibilityAdminService({ prisma });

  const response = await service.listRules();

  assert.equal(response.items.length, 2);
  assert.equal(response.items[0].description, 'Regola account attivi');
  assert.equal(response.items[0].fieldsAllowedCount, 1);
  assert.equal(response.items[1].description, undefined);
  assert.equal(response.items[1].fieldsDeniedCount, 1);
});

test('getRule maps optional description on detail responses', async () => {
  const prisma = {
    visibilityRule: {
      async findUnique() {
        return {
          id: 'ddcf4148-5230-45ea-97e0-741417507a85',
          coneId: '1711c370-76c2-48c1-a29d-c2554b338e21',
          objectApiName: 'Account',
          description: 'Regola account attivi',
          effect: 'ALLOW',
          conditionJson: {
            field: 'Status__c',
            op: '=',
            value: 'Active',
          },
          fieldsAllowed: ['Name'],
          fieldsDenied: null,
          active: true,
        };
      },
    },
  };
  const { service } = createVisibilityAdminService({ prisma });

  const response = await service.getRule('ddcf4148-5230-45ea-97e0-741417507a85');

  assert.equal(response.rule.description, 'Regola account attivi');
  assert.equal(response.rule.objectApiName, 'Account');
});
