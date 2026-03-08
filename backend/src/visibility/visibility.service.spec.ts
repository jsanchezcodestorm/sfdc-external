import assert from 'node:assert/strict';
import test from 'node:test';

import { VisibilityPolicyDefinitionCacheStatus } from '@prisma/client';

import { VisibilityService } from './visibility.service';

const CONTACT_ID = '003000000000001AAA';
const OBJECT_API_NAME = 'Account';

function createCompiledDefinition() {
  return [
    {
      id: 'cone-1',
      code: 'SALES',
      priority: 10,
      rules: [
        {
          id: 'rule-1',
          effect: 'ALLOW',
          compiledPredicate: "OwnerId = '005000000000001AAA'",
          fieldsAllowed: ['Id', 'Name'],
          fieldsDenied: [],
        },
      ],
    },
  ];
}

function createVisibilityService(options?: {
  cachedDefinitionRow?: Record<string, unknown> | null;
  cachedScope?: Record<string, unknown> | null;
  liveRules?: unknown[];
  objectPolicyVersion?: bigint;
  onAssignmentsFindMany?: (input: Record<string, unknown>) => void;
}) {
  const policyDefinitionFindUniqueCalls: Array<Record<string, unknown>> = [];
  const policyDefinitionCreateCalls: Array<Record<string, unknown>> = [];
  const policyDefinitionUpdateCalls: Array<Record<string, unknown>> = [];
  const userScopeFindUniqueCalls: Array<Record<string, unknown>> = [];
  const userScopeUpsertCalls: Array<Record<string, unknown>> = [];
  const assignmentFindManyCalls: Array<Record<string, unknown>> = [];
  const coneFindManyCalls: Array<Record<string, unknown>> = [];

  const service = new VisibilityService(
    {
      get(key: string, fallback?: string) {
        const values: Record<string, string> = {
          VISIBILITY_CACHE_TTL_SECONDS: '300',
          VISIBILITY_AUDIT_ENABLED: 'true',
        };

        return values[key] ?? fallback;
      },
    } as never,
    {
      visibilityPolicyMeta: {
        async findUnique() {
          return { policyVersion: 5n };
        },
      },
      visibilityObjectPolicyVersion: {
        async findUnique() {
          return { policyVersion: options?.objectPolicyVersion ?? 3n };
        },
      },
      visibilityPolicyDefinitionCache: {
        async findUnique(input: Record<string, unknown>) {
          policyDefinitionFindUniqueCalls.push(input);
          return options?.cachedDefinitionRow ?? null;
        },
        async create(input: Record<string, unknown>) {
          policyDefinitionCreateCalls.push(input);
        },
        async update(input: Record<string, unknown>) {
          policyDefinitionUpdateCalls.push(input);
        },
      },
      visibilityUserScopeCache: {
        async findUnique(input: Record<string, unknown>) {
          userScopeFindUniqueCalls.push(input);
          return options?.cachedScope ?? null;
        },
        async upsert(input: Record<string, unknown>) {
          userScopeUpsertCalls.push(input);
        },
      },
      visibilityAssignment: {
        async findMany(input: Record<string, unknown>) {
          assignmentFindManyCalls.push(input);
          options?.onAssignmentsFindMany?.(input);
          return [{ id: 'assignment-1', coneId: 'cone-1' }];
        },
      },
      visibilityCone: {
        async findMany(input: Record<string, unknown>) {
          coneFindManyCalls.push(input);
          return options?.liveRules ?? [
            {
              id: 'cone-1',
              code: 'SALES',
              priority: 10,
              rules: [
                {
                  id: 'rule-1',
                  objectApiName: OBJECT_API_NAME,
                  effect: 'ALLOW',
                  conditionJson: {
                    field: 'OwnerId',
                    op: '=',
                    value: '005000000000001AAA',
                  },
                  fieldsAllowed: ['Id', 'Name'],
                  fieldsDenied: [],
                  active: true,
                },
              ],
            },
          ];
        },
      },
    } as never,
    {
      async recordVisibilityEventOrThrow() {},
    } as never,
  );

  return {
    service,
    calls: {
      assignmentFindManyCalls,
      coneFindManyCalls,
      policyDefinitionCreateCalls,
      policyDefinitionFindUniqueCalls,
      policyDefinitionUpdateCalls,
      userScopeFindUniqueCalls,
      userScopeUpsertCalls,
    },
  };
}

test('evaluate returns a user-scope cache hit without reading assignments', async () => {
  const { service, calls } = createVisibilityService({
    cachedDefinitionRow: {
      objectApiName: OBJECT_API_NAME,
      objectPolicyVersion: 3n,
      status: VisibilityPolicyDefinitionCacheStatus.READY,
      compiledDefinition: createCompiledDefinition(),
      invalidRuleId: null,
      invalidRuleMessage: null,
    },
    cachedScope: {
      compiledAllowPredicate: "OwnerId = '005000000000001AAA'",
      compiledDenyPredicate: null,
      compiledPredicate: "OwnerId = '005000000000001AAA'",
      compiledFields: ['Id', 'Name'],
      deniedFields: [],
      appliedCones: ['SALES'],
      appliedRules: ['rule-1'],
      matchedAssignments: ['assignment-1'],
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const evaluation = await service.evaluate({
    contactId: CONTACT_ID,
    permissions: ['PORTAL_ADMIN'],
    objectApiName: OBJECT_API_NAME,
  });

  assert.equal(evaluation.decision, 'ALLOW');
  assert.equal(evaluation.policyVersion, 5);
  assert.equal(evaluation.objectPolicyVersion, 3);
  assert.deepEqual(evaluation.appliedCones, ['SALES']);
  assert.deepEqual(evaluation.appliedRules, ['rule-1']);
  assert.deepEqual(evaluation.matchedAssignments, ['assignment-1']);
  assert.equal(calls.assignmentFindManyCalls.length, 0);
  assert.equal(calls.coneFindManyCalls.length, 0);
  assert.equal(calls.userScopeUpsertCalls.length, 0);
});

test('evaluate uses definition cache on user-scope miss and persists full scope metadata', async () => {
  const assignmentWhereInputs: Array<Record<string, unknown>> = [];
  const { service, calls } = createVisibilityService({
    cachedDefinitionRow: {
      objectApiName: OBJECT_API_NAME,
      objectPolicyVersion: 3n,
      status: VisibilityPolicyDefinitionCacheStatus.READY,
      compiledDefinition: createCompiledDefinition(),
      invalidRuleId: null,
      invalidRuleMessage: null,
    },
    cachedScope: null,
    onAssignmentsFindMany(input) {
      assignmentWhereInputs.push(input);
    },
  });

  const evaluation = await service.evaluate({
    contactId: CONTACT_ID,
    permissions: ['portal_admin', 'PORTAL_ADMIN'],
    objectApiName: OBJECT_API_NAME,
    recordType: undefined,
  } as never);

  assert.equal(evaluation.decision, 'ALLOW');
  assert.equal(calls.coneFindManyCalls.length, 0);
  assert.equal(calls.assignmentFindManyCalls.length, 1);
  assert.equal(calls.userScopeUpsertCalls.length, 1);
  assert.deepEqual(evaluation.appliedCones, ['SALES']);
  assert.deepEqual(evaluation.appliedRules, ['rule-1']);
  assert.deepEqual(evaluation.matchedAssignments, ['assignment-1']);
  assert.equal(
    (calls.userScopeUpsertCalls[0].create as Record<string, unknown>).compiledAllowPredicate,
    "OwnerId = '005000000000001AAA'",
  );
  assert.deepEqual(
    (calls.userScopeUpsertCalls[0].create as Record<string, unknown>).matchedAssignments,
    ['assignment-1'],
  );

  const where = assignmentWhereInputs[0].where as Record<string, unknown>;
  assert.deepEqual((where.coneId as Record<string, unknown>).in, ['cone-1']);
  const filters = where.AND as Array<Record<string, unknown>>;
  assert.equal(filters.length, 6);
  assert.ok(Array.isArray((filters[0].OR as unknown[]) ?? []));
  assert.deepEqual(filters[5], {
    recordType: null,
  });
});

test('evaluate lazily builds a policy definition cache when missing', async () => {
  const { service, calls } = createVisibilityService({
    cachedDefinitionRow: null,
    cachedScope: null,
  });

  const evaluation = await service.evaluate({
    contactId: CONTACT_ID,
    permissions: ['PORTAL_ADMIN'],
    objectApiName: OBJECT_API_NAME,
  });

  assert.equal(evaluation.decision, 'ALLOW');
  assert.equal(calls.coneFindManyCalls.length, 1);
  assert.equal(calls.policyDefinitionCreateCalls.length, 1);
  assert.equal(
    (calls.policyDefinitionCreateCalls[0].data as Record<string, unknown>).status,
    VisibilityPolicyDefinitionCacheStatus.READY,
  );
});

test('evaluate denies immediately when the cached policy definition is invalid', async () => {
  const { service, calls } = createVisibilityService({
    cachedDefinitionRow: {
      objectApiName: OBJECT_API_NAME,
      objectPolicyVersion: 3n,
      status: VisibilityPolicyDefinitionCacheStatus.INVALID,
      compiledDefinition: null,
      invalidRuleId: 'rule-1',
      invalidRuleMessage: 'invalid rule',
    },
    cachedScope: {
      compiledAllowPredicate: "OwnerId = '005000000000001AAA'",
      compiledPredicate: "OwnerId = '005000000000001AAA'",
      compiledFields: ['Id', 'Name'],
      deniedFields: [],
      appliedCones: ['SALES'],
      appliedRules: ['rule-1'],
      matchedAssignments: ['assignment-1'],
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const evaluation = await service.evaluate({
    contactId: CONTACT_ID,
    permissions: ['PORTAL_ADMIN'],
    objectApiName: OBJECT_API_NAME,
  });

  assert.equal(evaluation.decision, 'DENY');
  assert.equal(evaluation.reasonCode, 'INVALID_RULE_DROPPED');
  assert.equal(calls.userScopeFindUniqueCalls.length, 0);
  assert.equal(calls.assignmentFindManyCalls.length, 0);
});

test('evaluate with skipCache bypasses both caches and uses the live policy path', async () => {
  const { service, calls } = createVisibilityService({
    cachedDefinitionRow: {
      objectApiName: OBJECT_API_NAME,
      objectPolicyVersion: 3n,
      status: VisibilityPolicyDefinitionCacheStatus.READY,
      compiledDefinition: createCompiledDefinition(),
      invalidRuleId: null,
      invalidRuleMessage: null,
    },
    cachedScope: {
      compiledAllowPredicate: "OwnerId = '005000000000001AAA'",
      compiledPredicate: "OwnerId = '005000000000001AAA'",
      compiledFields: ['Id', 'Name'],
      deniedFields: [],
      appliedCones: ['SALES'],
      appliedRules: ['rule-1'],
      matchedAssignments: ['assignment-1'],
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const evaluation = await service.evaluate({
    contactId: CONTACT_ID,
    permissions: ['PORTAL_ADMIN'],
    objectApiName: OBJECT_API_NAME,
    skipCache: true,
  });

  assert.equal(evaluation.decision, 'ALLOW');
  assert.equal(calls.policyDefinitionFindUniqueCalls.length, 0);
  assert.equal(calls.userScopeFindUniqueCalls.length, 0);
  assert.equal(calls.coneFindManyCalls.length, 1);
  assert.equal(calls.assignmentFindManyCalls.length, 1);
});
