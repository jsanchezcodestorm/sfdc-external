import { createHash } from 'node:crypto';

import { BadRequestException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import jsforce from 'jsforce';
import type { Connection } from 'jsforce';

import { PrismaService } from '../prisma/prisma.service';

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

interface SalesforceDescribeCacheContext {
  cacheKey: string;
  cacheScope: string;
  apiVersion: string;
  objectApiName: string;
}

interface SalesforceConnectionContext {
  cacheScope: string;
  apiVersion: string;
}

const DEFAULT_DESCRIBE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class SalesforceService {
  private readonly logger = new Logger(SalesforceService.name);
  private readonly describeRefreshes = new Map<string, Promise<Record<string, unknown>>>();
  private readonly describeCacheTtlMs: number;
  private readonly describeCacheStaleWhileRevalidateMs: number;
  private connection: Connection | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService
  ) {
    this.describeCacheTtlMs = this.readPositiveIntConfig('SALESFORCE_DESCRIBE_CACHE_TTL_MS', DEFAULT_DESCRIBE_CACHE_TTL_MS);
    this.describeCacheStaleWhileRevalidateMs = this.readPositiveIntConfig(
      'SALESFORCE_DESCRIBE_STALE_WHILE_REVALIDATE_MS',
      this.describeCacheTtlMs
    );
  }

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
    const cacheContext = this.createDescribeCacheContext(objectApiName, this.resolveConnectionContext(connection));

    return this.readDescribeFromCacheOrSource(connection, cacheContext);
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

    try {
      return await connection.query(soql);
    } catch (error) {
      try {
        await this.tryInvalidateDescribeCacheForInvalidField(connection, soql, error);
      } catch (invalidateError) {
        this.logger.warn(
          `Failed to invalidate Salesforce describe cache after query error: ${this.normalizeErrorMessage(invalidateError)}`
        );
      }
      throw error;
    }
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

  private async readDescribeFromCacheOrSource(
    connection: Connection,
    cacheContext: SalesforceDescribeCacheContext
  ): Promise<Record<string, unknown>> {
    const cachedEntry = await this.prismaService.salesforceSObjectDescribeCache.findUnique({
      where: { cacheKey: cacheContext.cacheKey }
    });

    if (!cachedEntry) {
      return this.refreshDescribeCache(connection, cacheContext);
    }

    const cachedDescribe = this.asCachedDescribe(cachedEntry.describeJson);
    if (!cachedDescribe) {
      return this.refreshDescribeCache(connection, cacheContext);
    }

    const nowMs = Date.now();
    const expiresAtMs = cachedEntry.expiresAt.getTime();

    if (expiresAtMs > nowMs) {
      return cachedDescribe;
    }

    const staleAgeMs = nowMs - expiresAtMs;
    if (staleAgeMs <= this.describeCacheStaleWhileRevalidateMs) {
      void this.refreshDescribeCache(connection, cacheContext).catch((error) => {
        this.logger.warn(
          `Failed to refresh Salesforce describe cache for ${cacheContext.objectApiName}: ${this.normalizeErrorMessage(error)}`
        );
      });

      return cachedDescribe;
    }

    return this.refreshDescribeCache(connection, cacheContext);
  }

  private async refreshDescribeCache(
    connection: Connection,
    cacheContext: SalesforceDescribeCacheContext
  ): Promise<Record<string, unknown>> {
    const inFlight = this.describeRefreshes.get(cacheContext.cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = this.loadAndPersistDescribe(connection, cacheContext).finally(() => {
      this.describeRefreshes.delete(cacheContext.cacheKey);
    });

    this.describeRefreshes.set(cacheContext.cacheKey, refreshPromise);
    return refreshPromise;
  }

  private async loadAndPersistDescribe(
    connection: Connection,
    cacheContext: SalesforceDescribeCacheContext
  ): Promise<Record<string, unknown>> {
    const describe = await connection.sobject(cacheContext.objectApiName).describe();
    const normalizedDescribe = this.normalizeDescribePayload(describe, cacheContext.objectApiName);
    const payloadJson = JSON.stringify(normalizedDescribe);
    const payloadHash = createHash('sha256').update(payloadJson).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.describeCacheTtlMs);

    await this.prismaService.salesforceSObjectDescribeCache.upsert({
      where: { cacheKey: cacheContext.cacheKey },
      create: {
        cacheKey: cacheContext.cacheKey,
        cacheScope: cacheContext.cacheScope,
        objectApiName: cacheContext.objectApiName,
        apiVersion: cacheContext.apiVersion,
        describeJson: normalizedDescribe,
        payloadHash,
        fetchedAt: now,
        expiresAt
      },
      update: {
        cacheScope: cacheContext.cacheScope,
        objectApiName: cacheContext.objectApiName,
        apiVersion: cacheContext.apiVersion,
        describeJson: normalizedDescribe,
        payloadHash,
        fetchedAt: now,
        expiresAt
      }
    });

    return normalizedDescribe;
  }

  private normalizeDescribePayload(value: unknown, objectApiName: string): Prisma.JsonObject {
    if (!this.isObjectRecord(value)) {
      throw new ServiceUnavailableException(`Salesforce describe failed for ${objectApiName}: invalid response shape`);
    }

    const serialized = JSON.stringify(value);
    const normalized = JSON.parse(serialized) as unknown;

    if (!this.isObjectRecord(normalized)) {
      throw new ServiceUnavailableException(`Salesforce describe failed for ${objectApiName}: invalid JSON payload`);
    }

    return normalized as Prisma.JsonObject;
  }

  private asCachedDescribe(value: unknown): Record<string, unknown> | null {
    if (!this.isObjectRecord(value)) {
      return null;
    }

    return value;
  }

  private createDescribeCacheContext(
    objectApiName: string,
    connectionContext: SalesforceConnectionContext
  ): SalesforceDescribeCacheContext {
    const normalizedObjectApiName = objectApiName.trim();
    if (!normalizedObjectApiName) {
      throw new BadRequestException('objectApiName is required');
    }

    const rawKey = `${connectionContext.cacheScope}::${connectionContext.apiVersion}::${normalizedObjectApiName}`;
    const cacheKey = createHash('sha256').update(rawKey).digest('hex');

    return {
      cacheKey,
      cacheScope: connectionContext.cacheScope,
      apiVersion: connectionContext.apiVersion,
      objectApiName: normalizedObjectApiName
    };
  }

  private resolveConnectionContext(connection: Connection): SalesforceConnectionContext {
    const configuredApiVersion = this.configService.get<string>('SALESFORCE_API_VERSION')?.trim();
    const resolvedApiVersion =
      configuredApiVersion && configuredApiVersion.length > 0
        ? configuredApiVersion
        : this.readStringProperty(connection, 'version') ?? 'unknown';

    const organizationId = this.readOrganizationId(connection);
    const instanceUrl =
      this.configService.get<string>('SALESFORCE_INSTANCE_URL')?.trim() ??
      this.readStringProperty(connection, 'instanceUrl') ??
      this.configService.get<string>('SALESFORCE_LOGIN_URL')?.trim();
    const username = this.configService.get<string>('SALESFORCE_USERNAME')?.trim();

    const scopeParts = [organizationId, instanceUrl, username].filter(
      (part): part is string => typeof part === 'string' && part.length > 0
    );

    return {
      cacheScope: scopeParts.length > 0 ? scopeParts.join('|') : 'default',
      apiVersion: resolvedApiVersion
    };
  }

  private readOrganizationId(connection: Connection): string | undefined {
    const userInfo = this.readObjectProperty(connection, 'userInfo');
    if (!userInfo) {
      return undefined;
    }

    const organizationId = userInfo.organizationId;
    return typeof organizationId === 'string' && organizationId.trim().length > 0
      ? organizationId.trim()
      : undefined;
  }

  private readObjectProperty(target: unknown, propertyName: string): Record<string, unknown> | null {
    if (!this.isObjectRecord(target)) {
      return null;
    }

    const value = target[propertyName];
    return this.isObjectRecord(value) ? value : null;
  }

  private readStringProperty(target: unknown, propertyName: string): string | undefined {
    if (!this.isObjectRecord(target)) {
      return undefined;
    }

    const value = target[propertyName];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readPositiveIntConfig(configKey: string, fallback: number): number {
    const rawValue = this.configService.get<string>(configKey);
    if (!rawValue) {
      return fallback;
    }

    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async tryInvalidateDescribeCacheForInvalidField(
    connection: Connection,
    soql: string,
    error: unknown
  ): Promise<void> {
    if (!this.isInvalidFieldError(error)) {
      return;
    }

    const objectApiName = this.extractObjectApiNameFromSoql(soql);
    if (!objectApiName) {
      return;
    }

    const connectionContext = this.resolveConnectionContext(connection);

    await this.prismaService.salesforceSObjectDescribeCache.deleteMany({
      where: {
        cacheScope: connectionContext.cacheScope,
        apiVersion: connectionContext.apiVersion,
        objectApiName
      }
    });

    this.logger.warn(`Invalidated Salesforce describe cache for ${objectApiName} after INVALID_FIELD query error`);
  }

  private isInvalidFieldError(error: unknown): boolean {
    if (!this.isObjectRecord(error)) {
      return false;
    }

    const errorCode = typeof error.errorCode === 'string' ? error.errorCode.toUpperCase() : '';
    if (errorCode === 'INVALID_FIELD') {
      return true;
    }

    const message = typeof error.message === 'string' ? error.message.toUpperCase() : '';
    return message.includes('INVALID_FIELD') || message.includes('NO SUCH COLUMN');
  }

  private extractObjectApiNameFromSoql(soql: string): string | null {
    const match = /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)\b/i.exec(soql);
    if (!match) {
      return null;
    }

    return match[1];
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
