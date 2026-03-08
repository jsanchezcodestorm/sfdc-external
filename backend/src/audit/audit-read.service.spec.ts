import assert from 'node:assert/strict';
import test from 'node:test';

import { AuditReadService } from './audit-read.service';

function createQueryAuditRow(id: bigint, createdAt: Date) {
  return {
    id,
    requestId: `req-${id.toString()}`,
    createdAt,
    completedAt: new Date(createdAt.getTime() + 25),
    contactId: '003000000000001',
    queryKind: 'ENTITY_LIST',
    targetId: 'account',
    objectApiName: 'Account',
    recordId: null,
    status: 'SUCCESS' as const,
    resolvedSoql: 'SELECT Id, Name FROM Account',
    baseWhere: "Name LIKE 'Acme%'",
    baseWhereHash: 'hash-base',
    finalWhere: "(Name LIKE 'Acme%') AND (OwnerId = '005')",
    finalWhereHash: 'hash-final',
    rowCount: 2,
    durationMs: 11,
    errorCode: null,
    metadataJson: {
      entityId: 'account',
      page: 2,
    },
    resultJson: {
      returnedRows: 2,
      totalSize: 2,
      done: true,
    },
  };
}

function createVisibilityAuditRow(id: bigint, createdAt: Date) {
  return {
    id,
    requestId: `viz-${id.toString()}`,
    createdAt,
    contactId: '003000000000001',
    permissionsHash: 'perm-hash',
    recordType: 'administration',
    objectApiName: 'Account',
    queryKind: 'ENTITY_LIST',
    baseWhereHash: 'base-hash',
    finalWhereHash: 'final-hash',
    appliedCones: ['SALES'],
    appliedRules: ['rule-1'],
    decision: 'ALLOW' as const,
    decisionReasonCode: 'ALLOW_MATCH',
    rowCount: 2,
    durationMs: 13,
    policyVersion: 9n,
    objectPolicyVersion: 4n,
  };
}

test('listQueryAudit applies filters and returns a pagination cursor', async () => {
  const findManyCalls: Array<Record<string, unknown>> = [];
  const firstRow = createQueryAuditRow(12n, new Date('2026-03-07T11:00:00.000Z'));
  const secondRow = createQueryAuditRow(11n, new Date('2026-03-07T10:00:00.000Z'));

  const prismaService = {
    queryAuditLog: {
      async findMany(args: Record<string, unknown>) {
        findManyCalls.push(args);
        return [firstRow, secondRow];
      },
    },
  };

  const service = new AuditReadService(prismaService as never);
  const firstPage = await service.listQueryAudit({
    limit: 1,
    contactId: '003000000000001',
    requestId: 'req-12',
    queryKind: 'ENTITY_LIST',
    status: 'SUCCESS',
    targetId: 'account',
    objectApiName: 'Account',
    recordId: '001000000000001',
  });

  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.items[0].id, '12');
  assert.ok(firstPage.nextCursor);

  const firstWhere = findManyCalls[0].where as { AND: Array<Record<string, unknown>> };
  assert.deepEqual(firstWhere.AND, [
    { contactId: '003000000000001' },
    { requestId: 'req-12' },
    { queryKind: 'ENTITY_LIST' },
    { status: 'SUCCESS' },
    { targetId: 'account' },
    { objectApiName: 'Account' },
    { recordId: '001000000000001' },
  ]);

  await service.listQueryAudit({
    limit: 1,
    cursor: firstPage.nextCursor ?? undefined,
  });

  const secondWhere = findManyCalls[1].where as { AND: Array<Record<string, unknown>> };
  const cursorFilter = secondWhere.AND.find((entry) => Array.isArray((entry as { OR?: unknown[] }).OR));
  assert.ok(cursorFilter);
});

test('getQueryAudit maps the full detail payload', async () => {
  const row = createQueryAuditRow(44n, new Date('2026-03-07T12:00:00.000Z'));
  const prismaService = {
    queryAuditLog: {
      async findUnique() {
        return row;
      },
    },
  };

  const service = new AuditReadService(prismaService as never);
  const detail = await service.getQueryAudit('44');

  assert.equal(detail.id, '44');
  assert.equal(detail.queryKind, 'ENTITY_LIST');
  assert.equal(detail.resolvedSoql, 'SELECT Id, Name FROM Account');
  assert.equal(detail.baseWhereHash, 'hash-base');
  assert.equal(detail.finalWhereHash, 'hash-final');
  assert.deepEqual(detail.metadata, {
    entityId: 'account',
    page: 2,
  });
});

test('listVisibilityAudit maps objectPolicyVersion in the summary payload', async () => {
  const row = createVisibilityAuditRow(77n, new Date('2026-03-07T14:00:00.000Z'));
  const prismaService = {
    visibilityAuditLog: {
      async findMany() {
        return [row];
      },
    },
  };

  const service = new AuditReadService(prismaService as never);
  const page = await service.listVisibilityAudit({});

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].policyVersion, '9');
  assert.equal(page.items[0].objectPolicyVersion, '4');
});
