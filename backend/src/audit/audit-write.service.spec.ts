import assert from 'node:assert/strict';
import test from 'node:test';

import { AuditWriteService } from './audit-write.service';
import { RequestContextService } from './request-context.service';

function createAuditWriteService() {
  const securityCreateCalls: Array<Record<string, unknown>> = [];
  const visibilityCreateCalls: Array<Record<string, unknown>> = [];
  const applicationCreateCalls: Array<Record<string, unknown>> = [];
  const applicationUpdateCalls: Array<Record<string, unknown>> = [];
  const queryCreateCalls: Array<Record<string, unknown>> = [];
  const queryUpdateCalls: Array<Record<string, unknown>> = [];

  const configService = {
    get(key: string, fallback?: string) {
      if (key === 'AUDIT_HASH_SALT') {
        return 'test-salt';
      }

      return fallback;
    },
  };

  const prismaService = {
    securityAuditLog: {
      async create(args: { data: Record<string, unknown> }) {
        securityCreateCalls.push(args.data);
        return args.data;
      },
    },
    visibilityAuditLog: {
      async create(args: { data: Record<string, unknown> }) {
        visibilityCreateCalls.push(args.data);
        return args.data;
      },
    },
    applicationAuditLog: {
      async create(args: { data: Record<string, unknown> }) {
        applicationCreateCalls.push(args.data);
        return { id: 42n, ...args.data };
      },
      async update(args: Record<string, unknown>) {
        applicationUpdateCalls.push(args);
        return args;
      },
    },
    queryAuditLog: {
      async create(args: { data: Record<string, unknown> }) {
        queryCreateCalls.push(args.data);
        return { id: 99n, ...args.data };
      },
      async update(args: Record<string, unknown>) {
        queryUpdateCalls.push(args);
        return args;
      },
    },
  };

  const requestContextService = new RequestContextService();
  const auditWriteService = new AuditWriteService(
    configService as never,
    prismaService as never,
    requestContextService,
  );

  return {
    auditWriteService,
    requestContextService,
    calls: {
      securityCreateCalls,
      visibilityCreateCalls,
      applicationCreateCalls,
      applicationUpdateCalls,
      queryCreateCalls,
      queryUpdateCalls,
    },
  };
}

function createHttpContext(requestId = 'req-123') {
  const headers = new Map<string, string>();

  return {
    req: {
      method: 'GET',
      path: '/api/test',
      ip: '127.0.0.1',
      originalUrl: '/api/test',
      header(name: string) {
        if (name.toLowerCase() === 'x-request-id') {
          return requestId;
        }

        if (name.toLowerCase() === 'user-agent') {
          return 'node-test-agent';
        }

        return undefined;
      },
    },
    res: {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    },
    headers,
  };
}

test('recordSecurityEventOrThrow uses request context and hashes network fields', async () => {
  const { auditWriteService, requestContextService, calls } = createAuditWriteService();
  const { req, res, headers } = createHttpContext();

  await new Promise<void>((resolve, reject) => {
    requestContextService.run(req as never, res as never, () => {
      requestContextService.setUser({
        sub: '003000000000001',
        email: 'user@example.com',
        permissions: ['PORTAL_ADMIN'],
      });

      void auditWriteService
        .recordSecurityEventOrThrow({
          eventType: 'SESSION',
          decision: 'DENY',
          reasonCode: 'SESSION_INVALID',
        })
        .then(resolve, reject);
    });
  });

  assert.equal(headers.get('X-Request-Id'), 'req-123');
  assert.equal(calls.securityCreateCalls.length, 1);
  assert.equal(calls.securityCreateCalls[0].requestId, 'req-123');
  assert.equal(calls.securityCreateCalls[0].contactId, '003000000000001');
  assert.equal(calls.securityCreateCalls[0].eventType, 'SESSION');
  assert.notEqual(calls.securityCreateCalls[0].ipHash, '127.0.0.1');
  assert.notEqual(calls.securityCreateCalls[0].userAgentHash, 'node-test-agent');
});

test('createApplicationIntentOrThrow falls back to request context contact id', async () => {
  const { auditWriteService, requestContextService, calls } = createAuditWriteService();
  const { req, res } = createHttpContext('req-456');

  const auditId = await new Promise<bigint>((resolve, reject) => {
    requestContextService.run(req as never, res as never, () => {
      requestContextService.setUser({
        sub: '003000000000002',
        email: 'owner@example.com',
        permissions: ['PORTAL_ADMIN'],
      });

      void auditWriteService
        .createApplicationIntentOrThrow({
          action: 'ENTITY_CREATE',
          targetType: 'entity-record',
          targetId: 'account',
          payload: { Name: 'Acme' },
        })
        .then(resolve, reject);
    });
  });

  assert.equal(auditId, 42n);
  assert.equal(calls.applicationCreateCalls.length, 1);
  assert.equal(calls.applicationCreateCalls[0].requestId, 'req-456');
  assert.equal(calls.applicationCreateCalls[0].contactId, '003000000000002');
  assert.equal(calls.applicationCreateCalls[0].status, 'PENDING');
});

test('completeApplicationAuditOrThrow updates status and result payload', async () => {
  const { auditWriteService, calls } = createAuditWriteService();

  await auditWriteService.completeApplicationAuditOrThrow({
    auditId: 42n,
    status: 'SUCCESS',
    result: { success: true },
  });

  assert.equal(calls.applicationUpdateCalls.length, 1);
  const updateCall = calls.applicationUpdateCalls[0] as {
    where: { id: bigint }
    data: { status: string }
  };
  assert.equal(updateCall.where.id, 42n);
  assert.equal(updateCall.data.status, 'SUCCESS');
});

test('createQueryAuditIntentOrThrow stores resolved SOQL and WHERE hashes', async () => {
  const { auditWriteService, requestContextService, calls } = createAuditWriteService();
  const { req, res } = createHttpContext('req-789');

  const auditId = await new Promise<bigint>((resolve, reject) => {
    requestContextService.run(req as never, res as never, () => {
      requestContextService.setUser({
        sub: '003000000000003',
        email: 'query@example.com',
        permissions: ['PORTAL_ADMIN'],
      });

      void auditWriteService
        .createQueryAuditIntentOrThrow({
          queryKind: 'ENTITY_LIST',
          targetId: 'account',
          objectApiName: 'Account',
          resolvedSoql: 'SELECT Id FROM Account',
          baseWhere: "Name LIKE 'Acme%'",
          finalWhere: "(Name LIKE 'Acme%') AND (OwnerId = '005')",
          metadata: {
            entityId: 'account',
            page: 2,
          },
        })
        .then(resolve, reject);
    });
  });

  assert.equal(auditId, 99n);
  assert.equal(calls.queryCreateCalls.length, 1);
  assert.equal(calls.queryCreateCalls[0].requestId, 'req-789');
  assert.equal(calls.queryCreateCalls[0].contactId, '003000000000003');
  assert.equal(calls.queryCreateCalls[0].resolvedSoql, 'SELECT Id FROM Account');
  assert.equal(calls.queryCreateCalls[0].baseWhere, "Name LIKE 'Acme%'");
  assert.equal(calls.queryCreateCalls[0].finalWhere, "(Name LIKE 'Acme%') AND (OwnerId = '005')");
  assert.notEqual(calls.queryCreateCalls[0].baseWhereHash, "Name LIKE 'Acme%'");
  assert.notEqual(calls.queryCreateCalls[0].finalWhereHash, "(Name LIKE 'Acme%') AND (OwnerId = '005')");
});

test('completeQueryAuditOrThrow updates status, counters and result payload', async () => {
  const { auditWriteService, calls } = createAuditWriteService();

  await auditWriteService.completeQueryAuditOrThrow({
    auditId: 99n,
    status: 'FAILURE',
    rowCount: 0,
    durationMs: 17,
    errorCode: 'QUERY_FAILED',
    result: { message: 'boom' },
  });

  assert.equal(calls.queryUpdateCalls.length, 1);
  const updateCall = calls.queryUpdateCalls[0] as {
    where: { id: bigint }
    data: { status: string; durationMs: number; errorCode: string }
  };
  assert.equal(updateCall.where.id, 99n);
  assert.equal(updateCall.data.status, 'FAILURE');
  assert.equal(updateCall.data.durationMs, 17);
  assert.equal(updateCall.data.errorCode, 'QUERY_FAILED');
});
