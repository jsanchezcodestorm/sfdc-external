import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditWriteService } from '../audit/audit-write.service';
import { SalesforceService } from '../salesforce/salesforce.service';

import type {
  LocalCredentialAdminItem,
  LocalCredentialAdminListResponse,
  LocalCredentialAdminResponse,
  LocalCredentialUpsertInput
} from './auth.types';
import { LocalCredentialProvisioningService } from './local-credential-provisioning.service';
import { LocalCredentialRepository } from './local-credential.repository';

@Injectable()
export class LocalCredentialAdminService {
  constructor(
    private readonly localCredentialRepository: LocalCredentialRepository,
    private readonly localCredentialProvisioningService: LocalCredentialProvisioningService,
    private readonly salesforceService: SalesforceService,
    private readonly auditWriteService: AuditWriteService
  ) {}

  async listCredentials(): Promise<LocalCredentialAdminListResponse> {
    const rows = await this.localCredentialRepository.listCredentials();
    const items = await Promise.all(rows.map((row) => this.mapCredential(row)));
    return { items };
  }

  async upsertCredential(
    contactId: string,
    input: LocalCredentialUpsertInput
  ): Promise<LocalCredentialAdminResponse> {
    const normalizedContactId = contactId.trim();
    const contact = await this.salesforceService.findContactById(normalizedContactId);

    if (!contact?.email) {
      throw new BadRequestException('The selected Salesforce Contact must have an email address');
    }

    const existingCredential = await this.localCredentialRepository.findByContactId(normalizedContactId);

    await this.localCredentialProvisioningService.upsertResolvedCredential({
      contactId: normalizedContactId,
      username: contact.email,
      password: input.password,
      enabled: input.enabled
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: existingCredential ? 'LOCAL_CREDENTIAL_UPDATE' : 'LOCAL_CREDENTIAL_CREATE',
      targetType: 'local-credential',
      targetId: normalizedContactId,
      payload: {
        contactId: normalizedContactId,
        username: contact.email.trim().toLowerCase(),
        enabled: input.enabled ?? existingCredential?.enabled ?? true,
        passwordUpdated: Boolean(input.password?.trim())
      }
    });

    const credential = await this.localCredentialRepository.findByContactId(normalizedContactId);

    if (!credential) {
      throw new NotFoundException(`Local credential for ${normalizedContactId} not found after save`);
    }

    return {
      credential: await this.mapCredential(credential)
    };
  }

  async deleteCredential(contactId: string): Promise<void> {
    const normalizedContactId = contactId.trim();
    const existingCredential = await this.localCredentialRepository.findByContactId(normalizedContactId);

    if (!existingCredential) {
      throw new NotFoundException(`Local credential ${normalizedContactId} not found`);
    }

    await this.localCredentialRepository.deleteCredential(normalizedContactId);
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'LOCAL_CREDENTIAL_DELETE',
      targetType: 'local-credential',
      targetId: normalizedContactId,
      metadata: {
        username: existingCredential.username
      }
    });
  }

  private async mapCredential(row: {
    contactId: string;
    username: string;
    enabled: boolean;
    failedAttempts: number;
    lockedUntil: Date | null;
    lastLoginAt: Date | null;
    updatedAt: Date;
  }): Promise<LocalCredentialAdminItem> {
    const contact = await this.salesforceService.findContactById(row.contactId);

    return {
      contactId: row.contactId,
      username: row.username,
      enabled: row.enabled,
      failedAttempts: row.failedAttempts,
      lockedUntil: row.lockedUntil?.toISOString(),
      lastLoginAt: row.lastLoginAt?.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      contactName: contact?.name,
      contactEmail: contact?.email,
      contactRecordTypeDeveloperName: contact?.recordTypeDeveloperName
    };
  }
}
