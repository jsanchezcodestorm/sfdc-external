import { BadRequestException, ConflictException, Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { SetupSalesforceMode as PrismaSetupSalesforceMode } from '@prisma/client';

import { LocalCredentialProvisioningService } from '../auth/local-credential-provisioning.service';
import { platformAuthJson, platformConnectorsJson } from '../platform/platform-clients';
import { PrismaService } from '../prisma/prisma.service';

import { SetupRepository } from './setup.repository';
import type {
  CompletedSetup,
  SetupSalesforceConfig,
  SetupSalesforceTestResponse,
  SetupStatusResponse
} from './setup.types';
import {
  normalizeAdminEmail,
  normalizeBootstrapPassword,
  normalizeSalesforceSetupConfig,
  normalizeSiteName
} from './setup.validation';

const DEFAULT_DATA_SOURCE_ID = 'salesforce-default';

@Injectable()
export class SetupService {
  constructor(
    private readonly setupRepository: SetupRepository,
    private readonly prismaService: PrismaService,
    @Optional()
    @Inject(forwardRef(() => LocalCredentialProvisioningService))
    _legacyLocalCredentialProvisioningService?: LocalCredentialProvisioningService
  ) {}

  async getStatus(): Promise<SetupStatusResponse> {
    const record = await this.setupRepository.getRecord();

    if (!record?.completedAt) {
      return {
        state: 'pending',
        authConfigMode: 'database'
      };
    }

    return {
      state: 'completed',
      siteName: record.siteName,
      authConfigMode: 'database'
    };
  }

  async getCompletedSetup(): Promise<CompletedSetup | null> {
    const record = await this.setupRepository.getRecord();

    if (!record?.completedAt) {
      return null;
    }

    return {
      siteName: record.siteName,
      adminEmail: record.adminEmail,
      salesforce: {
        mode: 'access-token',
        instanceUrl: 'platform-managed',
        accessToken: 'platform-managed'
      },
      completedAt: record.completedAt.toISOString()
    };
  }

  async getCompletedAdminEmail(): Promise<string | null> {
    const record = await this.setupRepository.getRecord();
    return record?.completedAt ? record.adminEmail : null;
  }

  async testSalesforceConfig(payload: unknown): Promise<SetupSalesforceTestResponse> {
    await this.assertPending();
    const salesforce = normalizeSalesforceSetupConfig(payload);
    return platformConnectorsJson<SetupSalesforceTestResponse>(
      `/internal/connectors/sources/${encodeURIComponent(DEFAULT_DATA_SOURCE_ID)}/test`,
      {
        method: 'POST',
        body: { salesforce }
      }
    );
  }

  async completeSetup(payload: {
    siteName: unknown;
    adminEmail: unknown;
    bootstrapPassword: unknown;
    salesforce: unknown;
  }): Promise<SetupStatusResponse> {
    await this.assertPending();

    const siteName = normalizeSiteName(payload.siteName);
    const adminEmail = normalizeAdminEmail(payload.adminEmail);
    const bootstrapPassword = normalizeBootstrapPassword(payload.bootstrapPassword);
    const salesforce = normalizeSalesforceSetupConfig(payload.salesforce);
    const completedAt = new Date();

    await platformConnectorsJson<SetupSalesforceTestResponse>(
      `/internal/connectors/sources/${encodeURIComponent(DEFAULT_DATA_SOURCE_ID)}/configure`,
      {
        method: 'POST',
        body: { salesforce }
      }
    );

    const normalizedAdminSubjectId = adminEmail.trim().toLowerCase();
    await platformAuthJson('/internal/identities/upsert', {
      method: 'POST',
      body: {
        email: adminEmail,
        username: adminEmail,
        password: bootstrapPassword,
        enabled: true,
        memberships: [
          {
            productCode: 'sfdc-external',
            subjectId: normalizedAdminSubjectId,
            attributes: {
              bootstrapAdmin: true
            }
          }
        ]
      }
    });

    await this.prismaService.$transaction(async (transaction) => {
      await this.setupRepository.saveCompletedSetup(
        {
          siteName,
          adminEmail,
          salesforceMode: this.mapSalesforceMode(salesforce.mode),
          salesforceConfigEncrypted: 'platform-managed',
          completedAt
        },
        transaction
      );
    });

    return {
      state: 'completed',
      siteName,
      authConfigMode: 'database'
    };
  }

  private async assertPending(): Promise<void> {
    const record = await this.setupRepository.getRecord();

    if (record?.completedAt) {
      throw new ConflictException('Initial setup has already been completed');
    }
  }

  private mapSalesforceMode(mode: SetupSalesforceConfig['mode']): PrismaSetupSalesforceMode {
    return mode === 'username-password'
      ? PrismaSetupSalesforceMode.USERNAME_PASSWORD
      : PrismaSetupSalesforceMode.ACCESS_TOKEN;
  }
}
