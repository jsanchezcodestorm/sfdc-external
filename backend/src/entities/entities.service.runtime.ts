import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditWriteService } from '../audit/audit-write.service';
import { QueryAuditService } from '../audit/query-audit.service';
import type { SessionUser } from '../auth/session-user.interface';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceService } from '../salesforce/salesforce.service';
import type { VisibilityEvaluation } from '../visibility/visibility.types';
import { VisibilityService } from '../visibility/visibility.service';

import type { GetEntityListDto } from './dto/get-entity-list.dto';
import type { GetEntityRelatedListDto } from './dto/get-entity-related-list.dto';
import type { SearchEntityFormLookupDto } from './dto/search-entity-form-lookup.dto';
import type {
  EntityColumnConfig,
  EntityConfig,
  EntityFormFieldConfig,
  EntityListViewConfig,
  EntityQueryConfig
} from './entities.types';
import type { EntityRuntimeOperations } from './entities.runtime.operations';
import {
  type EntityCursorExecutionInput,
  type EntityCursorExecutionResult,
  type EntityDetailResponse,
  type EntityFieldDefinition,
  type EntityFormLookupSearchResult,
  type EntityFormResponse,
  type EntityFormSectionResponse,
  type EntityListResponse,
  type EntityRelatedListResponse,
  type LookupSearchContext,
  type ResolvedLookupMetadata,
  type SalesforceFieldSummary,
  type SoqlBuildOptions,
  type SoqlBuildResult,
  type WriteMode
} from './entities.runtime.types';
import { EntityConfigRepository } from './services/entity-config.repository';
import { EntityCursorQueryExecutor } from './services/entity-cursor-query.executor';
import { EntityDetailFormRuntime } from './services/entity-detail-form.runtime';
import { EntityFieldMetadataResolver } from './services/entity-field-metadata.resolver';
import { EntityFieldVisibilityFilter } from './services/entity-field-visibility.filter';
import { EntityListRuntime } from './services/entity-list.runtime';
import type { EntityQueryCursorRecord, EntityQueryCursorScope } from './services/entity-query-cursor.service';
import { EntityQueryCursorService } from './services/entity-query-cursor.service';
import {
  assertSalesforceRecordId,
  clamp,
  extractRecords,
  normalizeLookupSearchContext,
  readRecordStringValue,
  renderRecordTemplate,
  resolveRecordValue
} from './services/entity-runtime-utils';
import { EntitySoqlBuilder } from './services/entity-soql-builder';
import { EntityWritePayloadNormalizer } from './services/entity-write-payload.normalizer';
import { EntityWriteRuntime } from './services/entity-write.runtime';

@Injectable()
export class EntitiesRuntimeService {
  private readonly cursorQueryExecutor: EntityCursorQueryExecutor;
  private readonly detailFormRuntime: EntityDetailFormRuntime;
  private readonly fieldMetadataResolver: EntityFieldMetadataResolver;
  private readonly fieldVisibilityFilter: EntityFieldVisibilityFilter;
  private readonly listRuntime: EntityListRuntime;
  private readonly soqlBuilder: EntitySoqlBuilder;
  private readonly writePayloadNormalizer: EntityWritePayloadNormalizer;
  private readonly writeRuntime: EntityWriteRuntime;

  constructor(
    private readonly auditWriteService: AuditWriteService,
    private readonly queryAuditService: QueryAuditService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly entityConfigRepository: EntityConfigRepository,
    private readonly entityQueryCursorService: EntityQueryCursorService,
    private readonly salesforceService: SalesforceService,
    private readonly visibilityService: VisibilityService
  ) {
    this.fieldVisibilityFilter = new EntityFieldVisibilityFilter(
      (fields, visibility) => this.visibilityService.applyFieldVisibility(fields, visibility)
    );
    this.fieldMetadataResolver = new EntityFieldMetadataResolver(
      (objectApiName) => this.getDescribeFieldMap(objectApiName)
    );
    this.soqlBuilder = new EntitySoqlBuilder({
      getDescribeFieldMap: (objectApiName) => this.getDescribeFieldMap(objectApiName),
      applyFieldVisibility: (fields, visibility) => this.visibilityService.applyFieldVisibility(fields, visibility)
    });
    this.writePayloadNormalizer = new EntityWritePayloadNormalizer(
      (objectApiName) => this.getDescribeFieldMap(objectApiName),
      {
        isRequiredFieldForMode: (describe, mode) =>
          this.fieldMetadataResolver.isRequiredFieldForMode(describe, mode),
        isSystemManagedFieldName: (fieldName) =>
          this.fieldMetadataResolver.isSystemManagedFieldName(fieldName),
        isWritableFieldInMode: (describe, mode) =>
          this.fieldMetadataResolver.isWritableFieldInMode(describe, mode),
        shouldExcludeFormField: (fieldName, describe, mode) =>
          this.fieldMetadataResolver.shouldExcludeFormField(fieldName, describe, mode)
      }
    );
    this.cursorQueryExecutor = new EntityCursorQueryExecutor(
      this.queryAuditService,
      this.entityQueryCursorService,
      {
        assertCursorMatches: (cursor, input) => this.assertCursorMatches(cursor, input),
        buildCursorScope: (input, queryFingerprint, totalSize) =>
          this.buildEntityCursorScope(input, queryFingerprint, totalSize),
        buildQueryFingerprint: (input) => this.buildEntityQueryFingerprint(input),
        extractRecords: (result) => this.extractRecords(result)
      }
    );

    const operations = this.createRuntimeOperations();
    this.listRuntime = new EntityListRuntime(
      this.entityQueryCursorService,
      this.resourceAccessService,
      operations
    );
    this.detailFormRuntime = new EntityDetailFormRuntime(
      this.queryAuditService,
      this.resourceAccessService,
      this.visibilityService,
      operations
    );
    this.writeRuntime = new EntityWriteRuntime(
      this.auditWriteService,
      this.salesforceService,
      operations
    );
  }

  async getEntity(
    user: SessionUser,
    entityId: string
  ): Promise<{ entity: EntityConfig; visibility: VisibilityEvaluation }> {
    const entityConfig = await this.loadEntityConfig(entityId);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      entityConfig.objectApiName,
      {
        queryKind: 'ENTITY_CONFIG'
      }
    );
    await this.visibilityService.recordAudit({
      evaluation: visibility,
      queryKind: 'ENTITY_CONFIG',
      rowCount: 0,
      durationMs: 0
    });

    return {
      entity: entityConfig,
      visibility
    };
  }

  getEntityList(user: SessionUser, entityId: string, query: GetEntityListDto): Promise<EntityListResponse> {
    return this.listRuntime.getEntityList(user, entityId, query);
  }

  getEntityRecord(user: SessionUser, entityId: string, recordId: string): Promise<EntityDetailResponse> {
    return this.detailFormRuntime.getEntityRecord(user, entityId, recordId);
  }

  getEntityForm(user: SessionUser, entityId: string, recordId?: string): Promise<EntityFormResponse> {
    return this.detailFormRuntime.getEntityForm(user, entityId, recordId);
  }

  searchEntityFormLookup(
    user: SessionUser,
    entityId: string,
    fieldName: string,
    payload: SearchEntityFormLookupDto
  ): Promise<EntityFormLookupSearchResult> {
    return this.detailFormRuntime.searchEntityFormLookup(user, entityId, fieldName, payload);
  }

  getEntityRelatedList(
    user: SessionUser,
    entityId: string,
    relatedListId: string,
    params: GetEntityRelatedListDto
  ): Promise<EntityRelatedListResponse> {
    return this.listRuntime.getEntityRelatedList(user, entityId, relatedListId, params);
  }

  createEntityRecord(
    user: SessionUser,
    entityId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    return this.writeRuntime.createEntityRecord(user, entityId, payload);
  }

  updateEntityRecord(
    user: SessionUser,
    entityId: string,
    recordId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    return this.writeRuntime.updateEntityRecord(user, entityId, recordId, payload);
  }

  deleteEntityRecord(user: SessionUser, entityId: string, recordId: string): Promise<void> {
    return this.writeRuntime.deleteEntityRecord(user, entityId, recordId);
  }

  private createRuntimeOperations(): EntityRuntimeOperations {
    return {
      assertRecordInWriteScope: (
        user,
        entityId,
        objectApiName,
        recordId,
        visibility,
        queryKind,
        operation
      ) => this.assertRecordInWriteScope(user, entityId, objectApiName, recordId, visibility, queryKind, operation),
      assertSalesforceRecordId: (recordId) => this.assertSalesforceRecordId(recordId),
      authorizeEntityWriteAccess: (user, entityId, objectApiName, queryKind) =>
        this.authorizeEntityWriteAccess(user, entityId, objectApiName, queryKind),
      buildFieldDefinitions: (objectApiName, fields) => this.buildFieldDefinitions(objectApiName, fields),
      buildFormFieldDefinitions: (objectApiName, configuredSections, fields, mode) =>
        this.buildFormFieldDefinitions(objectApiName, configuredSections, fields, mode),
      buildLookupMetadata: (fieldConfig, describe) => this.buildLookupMetadata(fieldConfig, describe),
      buildLookupQueryConfig: (objectApiName, lookup, context) =>
        this.buildLookupQueryConfig(objectApiName, lookup, context),
      buildSoqlFromQueryConfig: (query, options) => this.buildSoqlFromQueryConfig(query, options),
      clamp: (value, min, max) => this.clamp(value, min, max),
      collectDetailFieldNames: (entityConfig, query) => this.collectDetailFieldNames(entityConfig, query),
      collectFormFieldNames: (sections) => this.collectFormFieldNames(sections),
      ensureVisibleFields: (fields, visibility, message) => this.ensureVisibleFields(fields, visibility, message),
      executeCursorPaginatedQuery: (input) => this.executeCursorPaginatedQuery(input),
      extractColumnFieldPaths: (columns) => this.extractColumnFieldPaths(columns),
      extractRecords: (result) => this.extractRecords(result),
      filterVisibleColumns: (columns, visibility) => this.filterVisibleColumns(columns, visibility),
      filterVisibleDetailSections: (sections, visibility) =>
        this.filterVisibleDetailSections(sections, visibility),
      findConfiguredFormField: (sections, fieldName) => this.findConfiguredFormField(sections, fieldName),
      getDescribeFieldMap: (objectApiName) => this.getDescribeFieldMap(objectApiName),
      isFieldVisible: (fieldPath, visibility) => this.isFieldVisible(fieldPath, visibility),
      loadEntityConfig: (entityId) => this.loadEntityConfig(entityId),
      normalizeLookupSearchContext: (value) => this.normalizeLookupSearchContext(value),
      normalizeSearchQuery: (search) => this.normalizeSearchQuery(search),
      normalizeWritePayload: (entityConfig, payload, mode) =>
        this.normalizeWritePayload(entityConfig, payload, mode),
      readRecordStringValue: (record, fieldPath) => this.readRecordStringValue(record, fieldPath),
      recordWriteVisibilityAudit: (visibility, queryKind) =>
        this.recordWriteVisibilityAudit(visibility, queryKind),
      renderRecordTemplate: (template, record) => this.renderRecordTemplate(template, record),
      resolveDetailTitle: (titleTemplate, fallbackTitle, record, entityConfig) =>
        this.resolveDetailTitle(titleTemplate, fallbackTitle, record, entityConfig),
      resolveFormSections: (formSections, objectApiName, mode) =>
        this.resolveFormSections(formSections, objectApiName, mode),
      resolveLookupProjectionFields: (objectApiName, fieldPaths) =>
        this.resolveLookupProjectionFields(objectApiName, fieldPaths),
      selectListView: (views, requestedViewId) => this.selectListView(views, requestedViewId)
    };
  }

  private async loadEntityConfig(entityId: string): Promise<EntityConfig> {
    this.resourceAccessService.assertEntityId(entityId, 'entityId');
    return this.entityConfigRepository.getEntityConfig(entityId);
  }

  private async authorizeEntityWriteAccess(
    user: SessionUser,
    entityId: string,
    objectApiName: string,
    queryKind: string
  ): Promise<VisibilityEvaluation> {
    return this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      objectApiName,
      {
        queryKind
      }
    );
  }

  private async recordWriteVisibilityAudit(visibility: VisibilityEvaluation, queryKind: string): Promise<void> {
    await this.visibilityService.recordAudit({
      evaluation: visibility,
      queryKind,
      rowCount: 0,
      durationMs: 0
    });
  }

  private async assertRecordInWriteScope(
    user: SessionUser,
    entityId: string,
    objectApiName: string,
    recordId: string,
    visibility: VisibilityEvaluation,
    queryKind: string,
    operation: 'update' | 'delete'
  ): Promise<void> {
    const normalizedObjectApiName = this.toSoqlIdentifier(objectApiName);
    const baseWhere = `Id = ${this.serializeSoqlValue(recordId)}`;
    const finalWhere = this.composeVisibilityWhere(baseWhere, visibility.compiledPredicate);
    const whereClause = finalWhere ? ` WHERE ${finalWhere}` : '';
    const rawResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind,
      targetId: entityId,
      objectApiName,
      recordId,
      resolvedSoql: `SELECT Id FROM ${normalizedObjectApiName}${whereClause} LIMIT 1`,
      visibility,
      baseWhere,
      finalWhere,
      metadata: {
        entityId,
        operation,
        selectedFields: ['Id']
      }
    });
    const { records } = this.extractRecords(rawResult);

    if (records.length === 0) {
      throw new NotFoundException(`Record ${recordId} not found`);
    }
  }

  private executeCursorPaginatedQuery(
    input: EntityCursorExecutionInput
  ): Promise<EntityCursorExecutionResult> {
    return this.cursorQueryExecutor.execute(input);
  }

  private buildEntityQueryFingerprint(input: EntityCursorExecutionInput): string {
    return this.entityQueryCursorService.hashFingerprint([
      input.user.sub,
      input.cursorKind,
      input.entityId,
      input.viewId,
      input.relatedListId,
      input.recordId,
      input.search,
      input.pageSize,
      input.objectApiName,
      input.resolvedSoql,
      input.baseWhere,
      input.finalWhere,
      input.visibility.permissionsHash,
      input.visibility.policyVersion,
      input.visibility.objectPolicyVersion,
      input.visibility.compiledPredicate,
      (input.visibility.compiledFields ?? []).join(','),
      input.selectedFields.join(',')
    ]);
  }

  private buildEntityCursorScope(
    input: EntityCursorExecutionInput,
    queryFingerprint: string,
    totalSize: number
  ): EntityQueryCursorScope {
    return {
      cursorKind: input.cursorKind,
      contactId: input.user.sub,
      entityId: input.entityId,
      viewId: input.viewId,
      relatedListId: input.relatedListId,
      recordId: input.recordId,
      searchTerm: input.search,
      objectApiName: input.objectApiName,
      pageSize: input.pageSize,
      totalSize,
      resolvedSoql: input.resolvedSoql,
      baseWhere: input.baseWhere,
      finalWhere: input.finalWhere,
      queryFingerprint
    };
  }

  private assertCursorMatches(
    cursor: EntityQueryCursorRecord,
    input: EntityCursorExecutionInput & { queryFingerprint: string }
  ): void {
    if (
      cursor.cursorKind !== input.cursorKind ||
      cursor.contactId !== input.user.sub ||
      cursor.entityId !== input.entityId ||
      cursor.viewId !== input.viewId ||
      cursor.relatedListId !== input.relatedListId ||
      cursor.recordId !== input.recordId ||
      cursor.pageSize !== input.pageSize ||
      cursor.objectApiName !== input.objectApiName ||
      (cursor.searchTerm ?? '') !== (input.search ?? '') ||
      cursor.queryFingerprint !== input.queryFingerprint
    ) {
      throw new BadRequestException('Invalid or expired entity cursor');
    }
  }

  private selectListView(views: EntityListViewConfig[], requestedViewId?: string): EntityListViewConfig {
    const requested = requestedViewId?.trim();
    if (requested) {
      const requestedView = views.find((view) => view.id === requested);
      if (requestedView) {
        return requestedView;
      }
    }

    const defaultView = views.find((view) => view.default === true);
    return defaultView ?? views[0];
  }

  private normalizeSearchQuery(search: string | undefined): string | undefined {
    const normalized = search?.trim();
    return normalized && normalized.length > 0 ? normalized : undefined;
  }

  private buildSoqlFromQueryConfig(
    query: EntityQueryConfig,
    options: SoqlBuildOptions
  ): Promise<SoqlBuildResult> {
    return this.soqlBuilder.buildSoqlFromQueryConfig(query, options);
  }

  private collectDetailFieldNames(entityConfig: EntityConfig, query: EntityQueryConfig): string[] {
    return this.fieldVisibilityFilter.collectDetailFieldNames(entityConfig, query.fields ?? []);
  }

  private extractColumnFieldPaths(columns: Array<string | { field?: unknown }>): string[] {
    return this.fieldVisibilityFilter.extractColumnFieldPaths(columns);
  }

  private filterVisibleColumns(
    columns: Array<string | EntityColumnConfig>,
    visibility: VisibilityEvaluation
  ): Array<string | EntityColumnConfig> {
    return this.fieldVisibilityFilter.filterVisibleColumns(columns, visibility);
  }

  private filterVisibleDetailSections(
    sections: NonNullable<NonNullable<EntityConfig['detail']>['sections']>,
    visibility: VisibilityEvaluation
  ): NonNullable<NonNullable<EntityConfig['detail']>['sections']> {
    return this.fieldVisibilityFilter.filterVisibleDetailSections(sections, visibility);
  }

  private isFieldVisible(fieldPath: string, visibility: VisibilityEvaluation): boolean {
    return this.fieldVisibilityFilter.isFieldVisible(fieldPath, visibility);
  }

  private ensureVisibleFields(
    fields: string[],
    visibility: VisibilityEvaluation,
    message: string
  ): void {
    this.fieldVisibilityFilter.ensureVisibleFields(fields, visibility, message);
  }

  private composeVisibilityWhere(
    baseWhere: string | undefined,
    compiledPredicate: string | undefined
  ): string | undefined {
    return this.soqlBuilder.composeVisibilityWhere(baseWhere, compiledPredicate);
  }

  private resolveLookupProjectionFields(objectApiName: string, fieldPaths: string[]): Promise<string[]> {
    return this.fieldMetadataResolver.resolveLookupProjectionFields(objectApiName, fieldPaths);
  }

  private collectFormFieldNames(sections: EntityFormSectionResponse[]): string[] {
    return this.fieldVisibilityFilter.collectFormFieldNames(sections);
  }

  private resolveFormSections(
    formSections: NonNullable<NonNullable<EntityConfig['form']>['sections']>,
    objectApiName: string,
    mode: WriteMode
  ): Promise<EntityFormSectionResponse[]> {
    return this.fieldMetadataResolver.resolveFormSections(formSections, objectApiName, mode);
  }

  private resolveDetailTitle(
    titleTemplate: string | undefined,
    fallbackTitle: string | undefined,
    record: Record<string, unknown>,
    entityConfig: EntityConfig
  ): string {
    const titleFromTemplate = this.renderRecordTemplate(titleTemplate, record);
    if (titleFromTemplate) {
      return titleFromTemplate;
    }

    if (fallbackTitle && fallbackTitle.trim().length > 0) {
      return fallbackTitle;
    }

    const recordName = this.resolveRecordValue(record, 'Name');
    if (typeof recordName === 'string' && recordName.trim().length > 0) {
      return recordName;
    }

    return `${entityConfig.label ?? entityConfig.id} Detail`;
  }

  private renderRecordTemplate(template: string | undefined, record: Record<string, unknown>): string | undefined {
    return renderRecordTemplate(template, record);
  }

  private resolveRecordValue(record: Record<string, unknown>, fieldPath: string): unknown {
    return resolveRecordValue(record, fieldPath);
  }

  private buildFieldDefinitions(objectApiName: string, fields: string[]): Promise<EntityFieldDefinition[]> {
    return this.fieldMetadataResolver.buildFieldDefinitions(objectApiName, fields);
  }

  private buildFormFieldDefinitions(
    objectApiName: string,
    configuredSections: NonNullable<NonNullable<EntityConfig['form']>['sections']>,
    fields: string[],
    mode: WriteMode
  ): Promise<EntityFieldDefinition[]> {
    return this.fieldMetadataResolver.buildFormFieldDefinitions(objectApiName, configuredSections, fields, mode);
  }

  private findConfiguredFormField(
    sections: NonNullable<NonNullable<EntityConfig['form']>['sections']>,
    fieldName: string
  ): EntityFormFieldConfig | null {
    return this.fieldMetadataResolver.findConfiguredFormField(sections, fieldName);
  }

  private normalizeLookupSearchContext(value: unknown): LookupSearchContext {
    return normalizeLookupSearchContext(value);
  }

  private buildLookupQueryConfig(
    objectApiName: string,
    lookup: ResolvedLookupMetadata,
    context: LookupSearchContext
  ): EntityQueryConfig {
    return this.fieldMetadataResolver.buildLookupQueryConfig(objectApiName, lookup, context);
  }

  private readRecordStringValue(record: Record<string, unknown>, fieldPath: string): string | undefined {
    return readRecordStringValue(record, fieldPath);
  }

  private normalizeWritePayload(
    entityConfig: EntityConfig,
    payload: unknown,
    mode: WriteMode
  ): Promise<Record<string, unknown>> {
    return this.writePayloadNormalizer.normalizeWritePayload(entityConfig, payload, mode);
  }

  private async getDescribeFieldMap(objectApiName: string): Promise<Map<string, SalesforceFieldSummary>> {
    const fields = await this.salesforceService.describeObjectFields(objectApiName.trim());
    const typedFields = fields as SalesforceFieldSummary[];
    return new Map(typedFields.map((field) => [field.name, field]));
  }

  private buildLookupMetadata(
    fieldConfig: EntityFormFieldConfig,
    describe: SalesforceFieldSummary
  ): Promise<ResolvedLookupMetadata | null> {
    return this.fieldMetadataResolver.buildLookupMetadata(fieldConfig, describe);
  }

  private extractRecords(result: unknown): { records: Array<Record<string, unknown>>; totalSize: number } {
    return extractRecords(result);
  }

  private serializeSoqlValue(value: string | number | boolean | null): string {
    return this.soqlBuilder.serializeSoqlValue(value);
  }

  private toSoqlIdentifier(identifier: string): string {
    return this.soqlBuilder.toSoqlIdentifier(identifier);
  }

  private assertSalesforceRecordId(recordId: string): void {
    assertSalesforceRecordId(recordId);
  }

  private clamp(value: number, min: number, max: number): number {
    return clamp(value, min, max);
  }
}
