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
}

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
      nillable: Boolean(field.nillable ?? false)
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
}
