import { createHash } from 'node:crypto';

import { BadRequestException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../prisma/generated/client';
import jsforce from 'jsforce';
import type { Connection } from 'jsforce';

import { AuditWriteService } from '../audit/audit-write.service';
import { PrismaService } from '../prisma/prisma.service';
import { SetupService } from '../setup/setup.service';
import type { SetupSalesforceConfig } from '../setup/setup.types';

import { SalesforceNotConfiguredException } from './salesforce-not-configured.exception';

interface SalesforceObjectSummary {
  name: string;
  label: string;
  custom: boolean;
}

export interface SalesforcePicklistValueSummary {
  value: string;
  label: string;
  active: boolean;
  defaultValue: boolean;
}

export interface SalesforceFieldSummary {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  defaultedOnCreate: boolean;
  calculated: boolean;
  autoNumber: boolean;
  picklistValues?: SalesforcePicklistValueSummary[];
  relationshipName?: string;
  referenceTo?: string[];
}

export interface SalesforceRecordTypeSummary {
  id: string;
  developerName: string;
  label: string;
  active: boolean;
  available: boolean;
  defaultRecordTypeMapping: boolean;
  master: boolean;
}

interface SalesforceContactRecord {
  Id: string;
  Name?: string;
  Email?: string;
  RecordType?: {
    DeveloperName?: string;
  } | null;
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

export interface SalesforceReadOnlyQueryResult {
  done: boolean;
  totalSize: number;
  records: Array<Record<string, unknown>>;
  nextRecordsUrl?: string;
}

const DEFAULT_DESCRIBE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SALESFORCE_ID_QUERY_PATTERN = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const SALESFORCE_QUERY_BATCH_SIZE_MIN = 200;
const SALESFORCE_QUERY_BATCH_SIZE_MAX = 2000;

@Injectable()
export class SalesforceService {
  private readonly logger = new Logger(SalesforceService.name);
  private readonly describeRefreshes = new Map<string, Promise<Record<string, unknown>>>();
  private readonly describeCacheTtlMs: number;
  private readonly describeCacheStaleWhileRevalidateMs: number;
  private connection: Connection | null = null;
  private connectionContext: SalesforceConnectionContext | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly auditWriteService: AuditWriteService,
    private readonly setupService: SetupService
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
      filterable: Boolean(field.filterable ?? false),
      defaultedOnCreate: Boolean(field.defaultedOnCreate ?? false),
      calculated: Boolean(field.calculated ?? false),
      autoNumber: Boolean(field.autoNumber ?? false),
      picklistValues: Array.isArray(field.picklistValues)
        ? field.picklistValues
            .filter((entry): entry is Record<string, unknown> => this.isObjectRecord(entry))
            .map((entry) => ({
              value: String(entry.value ?? ''),
              label: String(entry.label ?? entry.value ?? ''),
              active: Boolean(entry.active ?? false),
              defaultValue: Boolean(entry.defaultValue ?? false)
            }))
            .filter((entry) => entry.value.trim().length > 0)
        : undefined,
      relationshipName: typeof field.relationshipName === 'string' ? field.relationshipName : undefined,
      referenceTo: Array.isArray(field.referenceTo)
        ? field.referenceTo
            .map((entry) => String(entry).trim())
            .filter((entry) => entry.length > 0)
        : undefined
    }));
  }

  async describeRecordTypes(objectApiName: string): Promise<SalesforceRecordTypeSummary[]> {
    const objectDescription = (await this.describeObject(objectApiName)) as {
      recordTypeInfos?: Array<Record<string, unknown>>;
    };

    return (objectDescription.recordTypeInfos ?? [])
      .filter((entry): entry is Record<string, unknown> => this.isObjectRecord(entry))
      .map((entry) => ({
        id: String(entry.recordTypeId ?? '').trim(),
        developerName: String(entry.developerName ?? '').trim(),
        label: String(entry.name ?? entry.label ?? entry.developerName ?? '').trim(),
        active: Boolean(entry.active ?? false),
        available: Boolean(entry.available ?? false),
        defaultRecordTypeMapping: Boolean(entry.defaultRecordTypeMapping ?? false),
        master: Boolean(entry.master ?? false)
      }))
      .filter((entry) => entry.id.length > 0 && entry.developerName.length > 0);
  }

  async resolveRecordTypeId(objectApiName: string, developerName: string): Promise<string> {
    const normalizedDeveloperName = developerName.trim();
    if (!normalizedDeveloperName) {
      throw new BadRequestException('recordTypeDeveloperName is required');
    }

    const recordType = (await this.describeRecordTypes(objectApiName)).find(
      (entry) => entry.developerName === normalizedDeveloperName
    );
    if (!recordType || !recordType.active) {
      throw new BadRequestException(
        `Record type ${normalizedDeveloperName} is not available for ${objectApiName}`
      );
    }

    return recordType.id;
  }

  async findContactByEmail(
    email: string
  ): Promise<{ id: string; email?: string; recordTypeDeveloperName?: string } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }

    const result = (await this.executeReadOnlyQuery(
      `SELECT Id, Email, RecordType.DeveloperName FROM Contact WHERE Email = '${this.escapeSoqlLiteral(
        normalizedEmail
      )}' LIMIT 2`
    )) as { records?: SalesforceContactRecord[] };

    const records = Array.isArray(result.records) ? result.records : [];
    if (records.length === 0) {
      return null;
    }

    if (records.length > 1) {
      throw new ForbiddenException(`Multiple Salesforce Contacts found for ${normalizedEmail}`);
    }

    const contact = records[0];
    return {
      id: String(contact.Id),
      email: typeof contact.Email === 'string' ? contact.Email : undefined,
      recordTypeDeveloperName:
        typeof contact.RecordType?.DeveloperName === 'string'
          ? contact.RecordType.DeveloperName
          : undefined
    };
  }

  async findContactById(
    contactId: string,
  ): Promise<{ id: string; name?: string; email?: string; recordTypeDeveloperName?: string } | null> {
    const normalizedContactId = contactId.trim();
    if (!SALESFORCE_ID_QUERY_PATTERN.test(normalizedContactId)) {
      return null;
    }

    const result = (await this.executeReadOnlyQuery(
      [
        'SELECT Id, Name, Email, RecordType.DeveloperName',
        'FROM Contact',
        `WHERE Id = '${this.escapeSoqlLiteral(normalizedContactId)}'`,
        'LIMIT 1',
      ].join(' '),
    )) as { records?: SalesforceContactRecord[] };

    const records = Array.isArray(result.records) ? result.records : [];
    if (records.length === 0) {
      return null;
    }

    const contact = records[0];
    return {
      id: String(contact.Id),
      name: typeof contact.Name === 'string' ? contact.Name : undefined,
      email: typeof contact.Email === 'string' ? contact.Email : undefined,
      recordTypeDeveloperName:
        typeof contact.RecordType?.DeveloperName === 'string'
          ? contact.RecordType.DeveloperName
          : undefined,
    };
  }

  async searchContactsByIdOrName(
    query: string,
    limit: number
  ): Promise<Array<{ id: string; name?: string; recordTypeDeveloperName?: string }>> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      throw new BadRequestException('query must be at least 2 characters');
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
      throw new BadRequestException('limit must be an integer between 1 and 8');
    }

    const likePrefix = `${this.escapeSoqlLikeLiteral(normalizedQuery)}%`;
    const filters = [`Name LIKE '${likePrefix}'`];
    if (SALESFORCE_ID_QUERY_PATTERN.test(normalizedQuery)) {
      filters.unshift(`Id = '${this.escapeSoqlLiteral(normalizedQuery)}'`);
    }

    const result = (await this.executeReadOnlyQuery(
      [
        'SELECT Id, Name, RecordType.DeveloperName',
        'FROM Contact',
        `WHERE ${filters.join(' OR ')}`,
        'ORDER BY Name ASC, Id ASC',
        `LIMIT ${limit}`
      ].join(' ')
    )) as { records?: SalesforceContactRecord[] };

    const records = Array.isArray(result.records) ? result.records : [];
    return records.map((contact) => ({
      id: String(contact.Id),
      name: typeof contact.Name === 'string' ? contact.Name : undefined,
      recordTypeDeveloperName:
        typeof contact.RecordType?.DeveloperName === 'string'
          ? contact.RecordType.DeveloperName
          : undefined
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

  async executeReadOnlyQueryPage(soql: string, pageSize: number): Promise<SalesforceReadOnlyQueryResult> {
    this.assertReadOnlySoql(soql);
    const connection = await this.getConnection();

    try {
      const batchSize = this.resolveQueryBatchSize(pageSize);
      const result = (await connection.query(soql, {
        autoFetch: false,
        headers: {
          'Sforce-Query-Options': `batchSize=${batchSize}`
        }
      })) as SalesforceReadOnlyQueryResult;

      return this.normalizeReadOnlyQueryResult(result);
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

  async executeReadOnlyQueryMore(locator: string, pageSize: number): Promise<SalesforceReadOnlyQueryResult> {
    const normalizedLocator = locator.trim();
    if (!normalizedLocator) {
      throw new BadRequestException('Salesforce query locator is required');
    }

    const connection = await this.getConnection();
    const batchSize = this.resolveQueryBatchSize(pageSize);
    const result = (await connection.queryMore(normalizedLocator, {
      autoFetch: false,
      headers: {
        'Sforce-Query-Options': `batchSize=${batchSize}`
      },
      maxFetch: SALESFORCE_QUERY_BATCH_SIZE_MAX,
      responseTarget: 'QueryResult',
      scanAll: false
    })) as SalesforceReadOnlyQueryResult;

    return this.normalizeReadOnlyQueryResult(result);
  }

  async executeRawQuery(soql: string): Promise<unknown> {
    const rawQueryEnabled = this.configService.get<string>('ENABLE_RAW_SALESFORCE_QUERY', 'false') === 'true';

    if (!rawQueryEnabled) {
      await this.auditWriteService.recordSecurityEventOrThrow({
        eventType: 'RAW_QUERY',
        decision: 'DENY',
        reasonCode: 'RAW_QUERY_DISABLED'
      });
      throw new ForbiddenException('Raw Salesforce query endpoint is disabled');
    }

    await this.auditWriteService.recordSecurityEventOrThrow({
      eventType: 'RAW_QUERY',
      decision: 'ALLOW',
      reasonCode: 'RAW_QUERY_EXECUTED',
      metadata: {
        queryHash: createHash('sha256').update(soql).digest('hex')
      }
    });
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
    if (this.connectionContext) {
      return this.connectionContext;
    }

    const configuredApiVersion = this.configService.get<string>('SALESFORCE_API_VERSION')?.trim();
    const resolvedApiVersion =
      configuredApiVersion && configuredApiVersion.length > 0
        ? configuredApiVersion
        : this.readStringProperty(connection, 'version') ?? 'unknown';

    const organizationId = this.readOrganizationId(connection);
    const instanceUrl = this.readStringProperty(connection, 'instanceUrl');

    const scopeParts = [organizationId, instanceUrl].filter(
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

    const setup = await this.setupService.getCompletedSetup();
    if (!setup) {
      throw new SalesforceNotConfiguredException();
    }

    const connection = await this.createConnectionFromSetup(setup.salesforce);
    this.connectionContext = this.buildConnectionContext(connection, setup.salesforce);

    this.logger.log('Salesforce connection established.');
    this.connection = connection;
    return connection;
  }

  private async createConnectionFromSetup(config: SetupSalesforceConfig): Promise<Connection> {
    if (config.mode === 'access-token') {
      const connection = new jsforce.Connection({
        accessToken: config.accessToken,
        instanceUrl: config.instanceUrl
      });
      await connection.identity();
      return connection;
    }

    const connection = new jsforce.Connection({ loginUrl: config.loginUrl });
    await connection.login(config.username, `${config.password}${config.securityToken ?? ''}`);
    return connection;
  }

  private buildConnectionContext(
    connection: Connection,
    config: SetupSalesforceConfig
  ): SalesforceConnectionContext {
    const configuredApiVersion = this.configService.get<string>('SALESFORCE_API_VERSION')?.trim();
    const resolvedApiVersion =
      configuredApiVersion && configuredApiVersion.length > 0
        ? configuredApiVersion
        : this.readStringProperty(connection, 'version') ?? 'unknown';
    const organizationId = this.readOrganizationId(connection);
    const instanceUrl =
      this.readStringProperty(connection, 'instanceUrl') ??
      (config.mode === 'access-token' ? config.instanceUrl : config.loginUrl);
    const scopeIdentity = config.mode === 'access-token' ? 'access-token' : config.username;
    const scopeParts = [organizationId, instanceUrl, scopeIdentity].filter(
      (part): part is string => typeof part === 'string' && part.length > 0
    );

    return {
      cacheScope: scopeParts.length > 0 ? scopeParts.join('|') : 'default',
      apiVersion: resolvedApiVersion
    };
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

  private escapeSoqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private escapeSoqlLikeLiteral(value: string): string {
    return this.escapeSoqlLiteral(value).replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  private resolveQueryBatchSize(pageSize: number): number {
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw new BadRequestException('pageSize must be a positive integer');
    }

    return Math.max(
      SALESFORCE_QUERY_BATCH_SIZE_MIN,
      Math.min(SALESFORCE_QUERY_BATCH_SIZE_MAX, pageSize)
    );
  }

  private normalizeReadOnlyQueryResult(result: unknown): SalesforceReadOnlyQueryResult {
    if (!this.isObjectRecord(result)) {
      throw new ServiceUnavailableException('Salesforce query failed: invalid response shape');
    }

    const rawRecords = Array.isArray(result.records) ? result.records : [];
    const records = rawRecords.filter((entry): entry is Record<string, unknown> => this.isObjectRecord(entry));
    const totalSize = typeof result.totalSize === 'number' ? result.totalSize : records.length;
    const done = typeof result.done === 'boolean' ? result.done : true;
    const nextRecordsUrl =
      typeof result.nextRecordsUrl === 'string' && result.nextRecordsUrl.trim().length > 0
        ? result.nextRecordsUrl.trim()
        : undefined;

    return {
      done,
      totalSize,
      records,
      nextRecordsUrl
    };
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
