import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditWriteService } from '../audit/audit-write.service';
import { SalesforceService } from '../salesforce/salesforce.service';

import type {
  AclAdminContactPermission,
  AclAdminContactPermissionListResponse,
  AclAdminContactPermissionResponse,
  AclAdminContactSuggestionResponse,
} from './acl-admin.types';
import { AclConfigRepository } from './acl-config.repository';
import { normalizeCanonicalPermissionCode } from './acl-config.validation';
import { AclContactPermissionsRepository } from './acl-contact-permissions.repository';

const SALESFORCE_CONTACT_ID_PATTERN = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;

@Injectable()
export class AclContactPermissionsAdminService {
  constructor(
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly aclContactPermissionsRepository: AclContactPermissionsRepository,
    private readonly salesforceService: SalesforceService,
    private readonly auditWriteService: AuditWriteService,
  ) {}

  async listContactPermissions(): Promise<AclAdminContactPermissionListResponse> {
    const rows = await this.aclContactPermissionsRepository.listRows();
    const grouped = new Map<
      string,
      {
        permissionCodes: string[];
        updatedAt: Date;
      }
    >();

    for (const row of rows) {
      const existing = grouped.get(row.contactId);
      if (!existing) {
        grouped.set(row.contactId, {
          permissionCodes: [row.permissionCode],
          updatedAt: row.updatedAt,
        });
        continue;
      }

      existing.permissionCodes.push(row.permissionCode);
      if (row.updatedAt.getTime() > existing.updatedAt.getTime()) {
        existing.updatedAt = row.updatedAt;
      }
    }

    return {
      items: [...grouped.entries()].map(([contactId, entry]) => ({
        contactId,
        permissionCodes: [...entry.permissionCodes],
        permissionCount: entry.permissionCodes.length,
        updatedAt: entry.updatedAt.toISOString(),
      })),
    };
  }

  async getContactPermissions(contactId: string): Promise<AclAdminContactPermissionResponse> {
    const normalizedContactId = this.normalizeContactId(contactId, 'contactId');
    const rows = await this.aclContactPermissionsRepository.findByContactId(normalizedContactId);

    if (rows.length === 0) {
      throw new NotFoundException(`ACL contact permissions ${normalizedContactId} not found`);
    }

    return {
      contactPermissions: this.mapContactPermissions(rows),
    };
  }

  async updateContactPermissions(
    contactId: string,
    permissionCodes: unknown[],
  ): Promise<AclAdminContactPermissionResponse> {
    const normalizedContactId = this.normalizeContactId(contactId, 'contactId');
    await this.ensureContactExists(normalizedContactId);

    const snapshot = await this.aclConfigRepository.loadSnapshot();
    const normalizedPermissionCodes = this.normalizeExplicitPermissionCodes(permissionCodes, snapshot);
    const result = await this.aclContactPermissionsRepository.replaceForContact(
      normalizedContactId,
      normalizedPermissionCodes,
    );

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_CONTACT_PERMISSIONS_UPDATE',
      targetType: 'acl-contact-permissions',
      targetId: normalizedContactId,
      payload: normalizedPermissionCodes,
      metadata: {
        contactId: normalizedContactId,
        permissionCount: normalizedPermissionCodes.length,
        added: result.added,
        removed: result.removed,
      },
    });

    return {
      contactPermissions: this.mapContactPermissions(result.rows),
    };
  }

  async deleteContactPermissions(contactId: string): Promise<void> {
    const normalizedContactId = this.normalizeContactId(contactId, 'contactId');
    const deletedPermissionCodes = await this.aclContactPermissionsRepository.deleteForContact(
      normalizedContactId,
    );

    if (deletedPermissionCodes.length === 0) {
      throw new NotFoundException(`ACL contact permissions ${normalizedContactId} not found`);
    }

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_CONTACT_PERMISSIONS_DELETE',
      targetType: 'acl-contact-permissions',
      targetId: normalizedContactId,
      metadata: {
        contactId: normalizedContactId,
        permissionCount: deletedPermissionCodes.length,
        removed: deletedPermissionCodes,
      },
    });
  }

  async searchContacts(query: string, limit: number | undefined): Promise<AclAdminContactSuggestionResponse> {
    const items = await this.salesforceService.searchContactsByIdOrName(query, limit ?? 8);
    return { items };
  }

  private normalizeContactId(value: string, fieldName: string): string {
    const normalized = value.trim();
    if (!SALESFORCE_CONTACT_ID_PATTERN.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a valid Salesforce id`);
    }

    return normalized;
  }

  private async ensureContactExists(contactId: string): Promise<void> {
    const contact = await this.salesforceService.findContactById(contactId);
    if (!contact) {
      throw new BadRequestException(`Salesforce Contact ${contactId} not found`);
    }
  }

  private normalizeExplicitPermissionCodes(
    permissionCodes: unknown[],
    snapshot: Awaited<ReturnType<AclConfigRepository['loadSnapshot']>>,
  ): string[] {
    if (!Array.isArray(permissionCodes)) {
      throw new BadRequestException('permissionCodes must be an array');
    }

    const catalogCodes = new Set(snapshot.permissions.map((permission) => permission.code));
    const normalized = [...new Set(
      permissionCodes.map((entry, index) =>
        normalizeCanonicalPermissionCode(entry, `permissionCodes[${index}]`),
      ),
    )];

    if (normalized.length === 0) {
      throw new BadRequestException('permissionCodes must contain at least one explicit permission');
    }

    for (const permissionCode of normalized) {
      if (!catalogCodes.has(permissionCode)) {
        throw new BadRequestException(`ACL permission ${permissionCode} not found`);
      }
    }

    return normalized;
  }

  private mapContactPermissions(rows: Array<{ contactId: string; permissionCode: string; updatedAt: Date }>): AclAdminContactPermission {
    const latestUpdatedAt = rows.reduce(
      (latest, row) =>
        row.updatedAt.getTime() > latest.getTime() ? row.updatedAt : latest,
      rows[0].updatedAt,
    );

    return {
      contactId: rows[0].contactId,
      permissionCodes: rows.map((row) => row.permissionCode),
      updatedAt: latestUpdatedAt.toISOString(),
    };
  }
}
