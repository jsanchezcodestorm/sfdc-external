import assert from 'node:assert/strict';
import test from 'node:test';

import { VisibilityService } from './visibility.service';

const CONTACT_ID = '003000000000001AAA';

function createVisibilityService(options?: {
  conditionJson?: unknown;
  cachedScope?: {
    compiledPredicate: string;
    compiledFields?: unknown;
    expiresAt: Date;
  } | null;
}) {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const findUniqueCalls: Array<Record<string, unknown>> = [];

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
      visibilityAssignment: {
        async findMany() {
          return [
            {
              id: 'assignment-1',
              coneId: 'cone-1',
              contactId: CONTACT_ID,
              permissionCode: 'PORTAL_ADMIN',
              recordType: null,
              validFrom: null,
              validTo: null,
              cone: {
                id: 'cone-1',
                code: 'SALES',
                priority: 10,
                active: true,
                rules: [
                  {
                    id: 'rule-1',
                    objectApiName: 'Account',
                    effect: 'ALLOW',
                    conditionJson: options?.conditionJson ?? {
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
            },
          ];
        },
      },
      visibilityUserScopeCache: {
        async findUnique(input: Record<string, unknown>) {
          findUniqueCalls.push(input);
          return options?.cachedScope ?? null;
        },
        async upsert(input: Record<string, unknown>) {
          upsertCalls.push(input);
        },
      },
      visibilityPolicyMeta: {
        async findUnique() {
          return { policyVersion: 5n };
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
      upsertCalls,
      findUniqueCalls,
    },
  };
}

test('evaluate denies with INVALID_RULE_DROPPED when an active rule cannot be normalized', async () => {
  const { service, calls } = createVisibilityService({
    conditionJson: {},
  });

  const evaluation = await service.evaluate({
    contactId: CONTACT_ID,
    permissions: ['PORTAL_ADMIN'],
    objectApiName: 'Account',
    baseWhere: "Status__c = 'Active'",
  });

  assert.equal(evaluation.decision, 'DENY');
  assert.equal(evaluation.reasonCode, 'INVALID_RULE_DROPPED');
  assert.deepEqual(evaluation.appliedCones, ['SALES']);
  assert.deepEqual(evaluation.appliedRules, []);
  assert.equal(evaluation.finalWhere, "Status__c = 'Active'");
  assert.equal(calls.findUniqueCalls.length, 0);
  assert.equal(calls.upsertCalls.length, 0);
});

test('evaluate denies with INVALID_RULE_DROPPED even when a cached scope exists', async () => {
  const { service, calls } = createVisibilityService({
    conditionJson: {},
    cachedScope: {
      compiledPredicate: "OwnerId = '005000000000001AAA'",
      compiledFields: ['Id', 'Name'],
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const evaluation = await service.evaluate({
    contactId: CONTACT_ID,
    permissions: ['PORTAL_ADMIN'],
    objectApiName: 'Account',
  });

  assert.equal(evaluation.decision, 'DENY');
  assert.equal(evaluation.reasonCode, 'INVALID_RULE_DROPPED');
  assert.equal(calls.findUniqueCalls.length, 0);
  assert.equal(calls.upsertCalls.length, 0);
});
