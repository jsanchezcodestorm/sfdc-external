import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SetupSalesforceMode as PrismaSetupSalesforceMode } from '@prisma/client';
import jsforce from 'jsforce';

import { SetupSecretsService } from './setup-secrets.service';
import { SetupRepository } from './setup.repository';
import type {
  CompletedSetup,
  SetupSalesforceConfig,
  SetupSalesforceTestResponse,
  SetupStatusResponse,
} from './setup.types';
import {
  normalizeAdminEmail,
  normalizeSalesforceSetupConfig,
  normalizeSiteName,
} from './setup.validation';

@Injectable()
export class SetupService {
  constructor(
    private readonly setupRepository: SetupRepository,
    private readonly setupSecretsService: SetupSecretsService
  ) {}

  async getStatus(): Promise<SetupStatusResponse> {
    const record = await this.setupRepository.getRecord();

    if (!record?.completedAt) {
      return {
        state: 'pending',
        googleConfigMode: 'env',
      };
    }

    return {
      state: 'completed',
      siteName: record.siteName,
      googleConfigMode: 'env',
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
      salesforce: this.readStoredSalesforceConfig(record.salesforceConfigEncrypted),
      completedAt: record.completedAt.toISOString(),
    };
  }

  async getCompletedAdminEmail(): Promise<string | null> {
    const record = await this.setupRepository.getRecord();
    return record?.completedAt ? record.adminEmail : null;
  }

  async testSalesforceConfig(payload: unknown): Promise<SetupSalesforceTestResponse> {
    await this.assertPending();
    return this.probeSalesforceConnection(normalizeSalesforceSetupConfig(payload));
  }

  async completeSetup(payload: {
    siteName: unknown;
    adminEmail: unknown;
    salesforce: unknown;
  }): Promise<SetupStatusResponse> {
    await this.assertPending();

    const siteName = normalizeSiteName(payload.siteName);
    const adminEmail = normalizeAdminEmail(payload.adminEmail);
    const salesforce = normalizeSalesforceSetupConfig(payload.salesforce);

    await this.probeSalesforceConnection(salesforce);

    await this.setupRepository.saveCompletedSetup({
      siteName,
      adminEmail,
      salesforceMode: this.mapSalesforceMode(salesforce.mode),
      salesforceConfigEncrypted: this.setupSecretsService.encryptJson(salesforce),
      completedAt: new Date(),
    });

    return {
      state: 'completed',
      siteName,
      googleConfigMode: 'env',
    };
  }

  private async assertPending(): Promise<void> {
    const record = await this.setupRepository.getRecord();

    if (record?.completedAt) {
      throw new ConflictException('Initial setup has already been completed');
    }
  }

  private async probeSalesforceConnection(
    config: SetupSalesforceConfig
  ): Promise<SetupSalesforceTestResponse> {
    try {
      const connection =
        config.mode === 'username-password'
          ? new jsforce.Connection({ loginUrl: config.loginUrl })
          : new jsforce.Connection({
              accessToken: config.accessToken,
              instanceUrl: config.instanceUrl,
            });

      if (config.mode === 'username-password') {
        await connection.login(config.username, `${config.password}${config.securityToken ?? ''}`);
      }

      const identity = (await connection.identity()) as Record<string, unknown>;

      return {
        success: true,
        organizationId: this.readIdentityValue(identity, 'organization_id'),
        instanceUrl:
          this.readConnectionValue(connection, 'instanceUrl') ??
          (config.mode === 'access-token' ? config.instanceUrl : undefined),
        username: this.readIdentityValue(identity, 'username'),
      };
    } catch (error) {
      throw new BadRequestException(
        `Salesforce connection failed: ${this.normalizeErrorMessage(error)}`
      );
    }
  }

  private readStoredSalesforceConfig(value: string): SetupSalesforceConfig {
    try {
      return normalizeSalesforceSetupConfig(
        this.setupSecretsService.decryptJson<unknown>(value),
        'storedSalesforceConfig'
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new ServiceUnavailableException('Stored setup configuration is invalid');
      }

      throw error;
    }
  }

  private mapSalesforceMode(mode: SetupSalesforceConfig['mode']): PrismaSetupSalesforceMode {
    return mode === 'username-password'
      ? PrismaSetupSalesforceMode.USERNAME_PASSWORD
      : PrismaSetupSalesforceMode.ACCESS_TOKEN;
  }

  private readIdentityValue(identity: Record<string, unknown>, key: string): string | undefined {
    const value = identity[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readConnectionValue(connection: unknown, key: string): string | undefined {
    if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
      return undefined;
    }

    const value = (connection as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private normalizeErrorMessage(error: unknown): string {
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return 'Unknown error';
  }
}
