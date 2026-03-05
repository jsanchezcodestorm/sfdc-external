import { BadRequestException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jsforce from 'jsforce';
import type { Connection } from 'jsforce';

interface SalesforceObjectSummary {
  name: string;
  label: string;
  custom: boolean;
}

interface SalesforceFieldSummary {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
}

type SalesforceMutationOperation = 'create' | 'update' | 'delete';

@Injectable()
export class SalesforceService {
  private readonly logger = new Logger(SalesforceService.name);
  private connection: Connection | null = null;

  constructor(private readonly configService: ConfigService) {}

  async describeGlobalObjects(): Promise<SalesforceObjectSummary[]> {
    const connection = await this.getConnection();
    const globalDescription = (await connection.describeGlobal()) as {
      sobjects: Array<{ name: string; label: string; custom: boolean }>;
    };

    return globalDescription.sobjects.map((sobject) => ({
      name: sobject.name,
      label: sobject.label,
      custom: sobject.custom
    }));
  }

  async describeObject(objectApiName: string): Promise<unknown> {
    const connection = await this.getConnection();
    return connection.sobject(objectApiName).describe();
  }

  async describeObjectFields(objectApiName: string): Promise<SalesforceFieldSummary[]> {
    const objectDescription = (await this.describeObject(objectApiName)) as { fields?: Array<Record<string, unknown>> };

    return (objectDescription.fields ?? []).map((field) => ({
      name: String(field.name ?? ''),
      label: String(field.label ?? ''),
      type: String(field.type ?? ''),
      nillable: Boolean(field.nillable ?? false),
      createable: Boolean(field.createable ?? false),
      updateable: Boolean(field.updateable ?? false),
      filterable: Boolean(field.filterable ?? false)
    }));
  }

  async executeReadOnlyQuery(soql: string): Promise<unknown> {
    this.assertReadOnlySoql(soql);
    const connection = await this.getConnection();

    return connection.query(soql);
  }

  async executeRawQuery(soql: string): Promise<unknown> {
    const rawQueryEnabled = this.configService.get<string>('ENABLE_RAW_SALESFORCE_QUERY', 'false') === 'true';

    if (!rawQueryEnabled) {
      throw new ForbiddenException('Raw Salesforce query endpoint is disabled');
    }

    return this.executeReadOnlyQuery(soql);
  }

  async createRecord(objectApiName: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const connection = await this.getConnection();
      const result = await connection.sobject(objectApiName).create(values);
      return this.normalizeMutationResult('create', result);
    } catch (error) {
      this.rethrowMutationError('create', error);
    }
  }

  async updateRecord(
    objectApiName: string,
    recordId: string,
    values: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      const connection = await this.getConnection();
      const result = await connection.sobject(objectApiName).update({
        Id: recordId,
        ...values
      });

      return this.normalizeMutationResult('update', result, recordId);
    } catch (error) {
      this.rethrowMutationError('update', error);
    }
  }

  async deleteRecord(objectApiName: string, recordId: string): Promise<void> {
    try {
      const connection = await this.getConnection();
      const result = await connection.sobject(objectApiName).destroy(recordId);
      this.normalizeMutationResult('delete', result, recordId);
    } catch (error) {
      this.rethrowMutationError('delete', error);
    }
  }

  async ping(): Promise<void> {
    const connection = await this.getConnection();
    await connection.identity();
  }

  private async getConnection(): Promise<Connection> {
    if (this.connection) {
      return this.connection;
    }

    const accessToken = this.configService.get<string>('SALESFORCE_ACCESS_TOKEN');
    const instanceUrl = this.configService.get<string>('SALESFORCE_INSTANCE_URL');

    if (accessToken && instanceUrl) {
      this.connection = new jsforce.Connection({ accessToken, instanceUrl });
      return this.connection;
    }

    const username = this.configService.get<string>('SALESFORCE_USERNAME');
    const password = this.configService.get<string>('SALESFORCE_PASSWORD');
    const securityToken = this.configService.get<string>('SALESFORCE_SECURITY_TOKEN', '');
    const loginUrl = this.configService.get<string>('SALESFORCE_LOGIN_URL', 'https://login.salesforce.com');

    if (!username || !password) {
      throw new ServiceUnavailableException('Salesforce credentials are not configured');
    }

    const connection = new jsforce.Connection({ loginUrl });
    await connection.login(username, `${password}${securityToken}`);

    this.logger.log('Salesforce connection established.');
    this.connection = connection;
    return connection;
  }

  private assertReadOnlySoql(soql: string): void {
    const normalized = soql.trim().toUpperCase();

    if (!normalized.startsWith('SELECT ')) {
      throw new BadRequestException('Only SELECT queries are allowed');
    }

    if (normalized.includes(';')) {
      throw new BadRequestException('Semicolon is not allowed in SOQL input');
    }

    const forbiddenTokens = [' INSERT ', ' UPDATE ', ' DELETE ', ' UPSERT ', ' MERGE '];

    if (forbiddenTokens.some((token) => normalized.includes(token))) {
      throw new BadRequestException('Mutating SOQL tokens are not allowed');
    }
  }

  private normalizeMutationResult(
    operation: SalesforceMutationOperation,
    result: unknown,
    fallbackRecordId?: string
  ): Record<string, unknown> {
    if (!this.isObjectRecord(result)) {
      throw new BadRequestException(`Salesforce ${operation} failed: invalid response shape`);
    }

    const success = typeof result.success === 'boolean' ? result.success : false;
    const errors = this.extractErrorMessages(result.errors);

    if (!success) {
      const message = errors.length > 0 ? errors.join(', ') : 'unknown error';
      throw new BadRequestException(`Salesforce ${operation} failed: ${message}`);
    }

    const response: Record<string, unknown> = {
      success: true
    };

    const recordId = typeof result.id === 'string' ? result.id : fallbackRecordId;
    if (recordId) {
      response.Id = recordId;
    }

    if (errors.length > 0) {
      response.errors = errors;
    }

    return response;
  }

  private extractErrorMessages(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }

        if (this.isObjectRecord(entry)) {
          const rawMessage = entry.message;
          return typeof rawMessage === 'string' ? rawMessage.trim() : '';
        }

        return '';
      })
      .filter((entry) => entry.length > 0);
  }

  private rethrowMutationError(operation: SalesforceMutationOperation, error: unknown): never {
    if (error instanceof BadRequestException) {
      throw error;
    }

    if (this.isObjectRecord(error) && typeof error.message === 'string') {
      throw new BadRequestException(`Salesforce ${operation} failed: ${error.message}`);
    }

    throw new BadRequestException(`Salesforce ${operation} failed`);
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
