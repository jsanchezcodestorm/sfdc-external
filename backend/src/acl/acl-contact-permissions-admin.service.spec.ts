import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AclContactPermissionsAdminService } from './acl-contact-permissions-admin.service';

const CONTACT_ID = '003000000000001AAA';

function createAclContactPermissionsAdminService(options?: {
  initialRows?: Array<{ contactId: string; permissionCode: string; updatedAt?: Date }>;
  defaults?: string[];
  catalogCodes?: string[];
  contactExists?: boolean;
}) {
  const rows = (options?.initialRows ?? []).map((row) => ({
    contactId: row.contactId,
    permissionCode: row.permissionCode,
    updatedAt: row.updatedAt ?? new Date('2026-03-07T10:00:00.000Z'),
  }));
  const auditCalls: Array<Record<string, unknown>> = [];

  const repository = {
    async listRows() {
      return [...rows].sort((left, right) => {
        if (left.contactId === right.contactId) {
          return left.permissionCode.localeCompare(right.permissionCode);
        }

        return left.contactId.localeCompare(right.contactId);
      });
    },
    async findByContactId(contactId: string) {
      return rows
        .filter((row) => row.contactId === contactId)
        .sort((left, right) => left.permissionCode.localeCompare(right.permissionCode));
    },
    async replaceForContact(contactId: string, permissionCodes: string[]) {
      const previousCodes = rows
        .filter((row) => row.contactId === contactId)
        .map((row) => row.permissionCode);
      const nextUpdatedAt = new Date('2026-03-07T11:00:00.000Z');
      const added = permissionCodes.filter((permissionCode) => !previousCodes.includes(permissionCode));
      const removed = previousCodes.filter((permissionCode) => !permissionCodes.includes(permissionCode));

      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].contactId === contactId) {
          rows.splice(index, 1);
        }
      }

      for (const permissionCode of permissionCodes) {
        rows.push({
          contactId,
          permissionCode,
          updatedAt: nextUpdatedAt,
        });
      }

      return {
        added,
        removed,
        rows: rows
          .filter((row) => row.contactId === contactId)
          .sort((left, right) => left.permissionCode.localeCompare(right.permissionCode)),
      };
    },
    async deleteForContact(contactId: string) {
      const existingCodes = rows
        .filter((row) => row.contactId === contactId)
        .map((row) => row.permissionCode);

      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].contactId === contactId) {
          rows.splice(index, 1);
        }
      }

      return existingCodes;
    },
  };

  const aclConfigRepository = {
    async loadSnapshot() {
      const catalogCodes = options?.catalogCodes ?? ['PORTAL_USER', 'ACCOUNT_READ', 'ACCOUNT_WRITE'];
      return {
        permissions: catalogCodes.map((code) => ({ code })),
        defaultPermissions: options?.defaults ?? ['PORTAL_USER'],
        resources: [],
      };
    },
  };

  const salesforceService = {
    async findContactById() {
      return options?.contactExists === false ? null : { id: CONTACT_ID };
    },
    async searchContactsByIdOrName() {
      return [{ id: CONTACT_ID, name: 'Test Contact', recordTypeDeveloperName: 'Customer' }];
    },
  };

  const auditWriteService = {
    async recordApplicationSuccessOrThrow(input: Record<string, unknown>) {
      auditCalls.push(input);
    },
  };

  const service = new AclContactPermissionsAdminService(
    aclConfigRepository as never,
    repository as never,
    salesforceService as never,
    auditWriteService as never,
  );

  return { service, rows, auditCalls };
}

test('updateContactPermissions rejects an unknown Salesforce contact', async () => {
  const { service } = createAclContactPermissionsAdminService({
    contactExists: false,
  });

  await assert.rejects(
    () => service.updateContactPermissions(CONTACT_ID, ['ACCOUNT_READ']),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === `Salesforce Contact ${CONTACT_ID} not found`,
  );
});

test('updateContactPermissions rejects unknown and default permissions', async () => {
  const { service } = createAclContactPermissionsAdminService();

  await assert.rejects(
    () => service.updateContactPermissions(CONTACT_ID, ['UNKNOWN_PERMISSION']),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'ACL permission UNKNOWN_PERMISSION not found',
  );

  await assert.rejects(
    () => service.updateContactPermissions(CONTACT_ID, ['PORTAL_USER']),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'ACL permission PORTAL_USER is already enabled as a default permission',
  );
});

test('updateContactPermissions replaces the full explicit set and records audit metadata', async () => {
  const { service, auditCalls } = createAclContactPermissionsAdminService({
    initialRows: [
      { contactId: CONTACT_ID, permissionCode: 'ACCOUNT_READ' },
      { contactId: CONTACT_ID, permissionCode: 'ACCOUNT_EXPORT' },
    ],
    catalogCodes: ['PORTAL_USER', 'ACCOUNT_READ', 'ACCOUNT_WRITE', 'ACCOUNT_EXPORT'],
  });

  const response = await service.updateContactPermissions(CONTACT_ID, ['ACCOUNT_WRITE']);

  assert.deepEqual(response.contactPermissions.permissionCodes, ['ACCOUNT_WRITE']);
  assert.equal(auditCalls.length, 1);
  assert.deepEqual(auditCalls[0].metadata, {
    contactId: CONTACT_ID,
    permissionCount: 1,
    added: ['ACCOUNT_WRITE'],
    removed: ['ACCOUNT_READ', 'ACCOUNT_EXPORT'],
  });
});

test('deleteContactPermissions removes all explicit permissions for a contact', async () => {
  const { service, rows, auditCalls } = createAclContactPermissionsAdminService({
    initialRows: [{ contactId: CONTACT_ID, permissionCode: 'ACCOUNT_READ' }],
  });

  await service.deleteContactPermissions(CONTACT_ID);

  assert.deepEqual(rows, []);
  assert.equal(auditCalls.length, 1);

  await assert.rejects(
    () => service.getContactPermissions(CONTACT_ID),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.message === `ACL contact permissions ${CONTACT_ID} not found`,
  );
});
