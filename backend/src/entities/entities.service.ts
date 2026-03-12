import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditWriteService } from '../audit/audit-write.service';
import { QueryAuditService } from '../audit/query-audit.service';
import type { SessionUser } from '../auth/session-user.interface';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceService } from '../salesforce/salesforce.service';
import { VisibilityService } from '../visibility/visibility.service';
import type { VisibilityEvaluation } from '../visibility/visibility.types';

import type { GetEntityListDto } from './dto/get-entity-list.dto';
import type { GetEntityRelatedListDto } from './dto/get-entity-related-list.dto';
import type {
  EntityActionConfig,
  EntityColumnConfig,
  EntityConfig,
  EntityFormFieldConfig,
  EntityListSearchConfig,
  EntityListViewConfig,
  EntityPathStatusConfig,
  EntityQueryConfig,
  EntityQueryWhere,
  EntityQueryScalarValue
} from './entities.types';
import { EntityConfigRepository } from './services/entity-config.repository';
import { EntityQueryCursorService } from './services/entity-query-cursor.service';

const MAX_PAGE_SIZE = 2000;
const DEFAULT_PAGE_SIZE = 50;
const SOQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const WRITE_FIELD_API_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SALESFORCE_ID_PATTERN = /^[A-Za-z0-9]{15,18}$/;
const TEMPLATE_TOKEN_PATTERN = /\{\{\s*([^}]+)\s*\}\}/g;

const TEXT_SEARCH_TYPES = new Set([
  'string',
  'textarea',
  'longtextarea',
  'richtextarea',
  'phone',
  'email',
  'url',
  'id',
  'reference',
  'picklist',
  'multipicklist'
]);

const NUMERIC_SEARCH_TYPES = new Set(['int', 'double', 'currency', 'percent']);
const ENTITY_CREATE_QUERY_KIND = 'ENTITY_CREATE';
const ENTITY_UPDATE_QUERY_KIND = 'ENTITY_UPDATE';
const ENTITY_DELETE_QUERY_KIND = 'ENTITY_DELETE';
const ENTITY_UPDATE_PREFLIGHT_QUERY_KIND = 'ENTITY_UPDATE_PREFLIGHT';
const ENTITY_DELETE_PREFLIGHT_QUERY_KIND = 'ENTITY_DELETE_PREFLIGHT';

type FormInputType = 'text' | 'email' | 'tel' | 'date' | 'textarea';
type WriteMode = 'create' | 'update';

interface SalesforceFieldSummary {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  relationshipName?: string;
  referenceTo?: string[];
}

interface EntityFieldDefinition {
  field: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  inputType: FormInputType;
  required: boolean;
}

interface SoqlBuildOptions {
  context?: Record<string, unknown>;
  forcedLimit?: number;
  ignoreConfiguredLimit?: boolean;
  search?: string;
  searchConfig?: EntityListSearchConfig;
  extraFields?: string[];
  visibility?: VisibilityEvaluation;
}

interface EntityListResponse {
  title: string;
  subtitle?: string;
  columns: EntityListViewConfig['columns'];
  primaryAction?: EntityActionConfig;
  rowActions?: EntityActionConfig[];
  records: Array<Record<string, unknown>>;
  total: number;
  pageSize: number;
  nextCursor: string | null;
  viewId?: string;
  visibility: VisibilityEvaluation;
}

interface EntityDetailResponse {
  title: string;
  subtitle?: string;
  sections?: NonNullable<EntityConfig['detail']>['sections'];
  actions?: EntityActionConfig[];
  pathStatus?: EntityPathStatusConfig;
  record: Record<string, unknown>;
  data: Record<string, unknown>;
  relatedLists?: NonNullable<EntityConfig['detail']>['relatedLists'];
  fieldDefinitions: EntityFieldDefinition[];
  visibility: VisibilityEvaluation;
}

interface EntityFormSectionResponse {
  title: string;
  fields: Array<{
    field: string;
    label: string;
    inputType: FormInputType;
    required: boolean;
    placeholder?: string;
    lookup?: EntityFormFieldConfig['lookup'];
  }>;
}

interface EntityFormResponse {
  title: string;
  subtitle?: string;
  sections: EntityFormSectionResponse[];
  values?: Record<string, unknown>;
  record?: Record<string, unknown>;
  fieldDefinitions: EntityFieldDefinition[];
  visibility: VisibilityEvaluation;
}

interface EntityRelatedListResponse {
  relatedList: NonNullable<NonNullable<EntityConfig['detail']>['relatedLists']>[number];
  title: string;
  columns: NonNullable<NonNullable<EntityConfig['detail']>['relatedLists']>[number]['columns'];
  actions?: NonNullable<NonNullable<EntityConfig['detail']>['relatedLists']>[number]['actions'];
  rowActions?: NonNullable<NonNullable<EntityConfig['detail']>['relatedLists']>[number]['rowActions'];
  emptyState?: string;
  records: Array<Record<string, unknown>>;
  total: number;
  pageSize: number;
  nextCursor: string | null;
  visibility: VisibilityEvaluation;
}

interface EntityCursorExecutionInput {
  user: SessionUser;
  cursor?: string;
  cursorKind: 'list' | 'related-list';
  queryKind: 'ENTITY_LIST' | 'ENTITY_RELATED_LIST';
  entityId: string;
  objectApiName: string;
  pageSize: number;
  resolvedSoql: string;
  baseWhere: string;
  finalWhere: string;
  visibility: VisibilityEvaluation;
  metadata: Record<string, unknown>;
  recordId?: string;
  viewId?: string;
  relatedListId?: string;
  search?: string;
  selectedFields: string[];
}

interface EntityCursorExecutionResult {
  records: Array<Record<string, unknown>>;
  totalSize: number;
  nextCursor: string | null;
}

@Injectable()
export class EntitiesService {
  constructor(
    private readonly auditWriteService: AuditWriteService,
    private readonly queryAuditService: QueryAuditService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly entityConfigRepository: EntityConfigRepository,
    private readonly entityQueryCursorService: EntityQueryCursorService,
    private readonly salesforceService: SalesforceService,
    private readonly visibilityService: VisibilityService
  ) {}

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

  async getEntityList(user: SessionUser, entityId: string, query: GetEntityListDto): Promise<EntityListResponse> {
    await this.entityQueryCursorService.deleteExpiredCursors();
    const entityConfig = await this.loadEntityConfig(entityId);
    const listConfig = entityConfig.list;

    if (!listConfig || listConfig.views.length === 0) {
      throw new NotFoundException(`List view is not configured for ${entityId}`);
    }

    const selectedView = this.selectListView(listConfig.views, query.viewId);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      selectedView.query.object,
      {
        queryKind: 'ENTITY_LIST'
      }
    );
    const configuredPageSize = this.clamp(selectedView.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const pageSize = this.clamp(query.pageSize ?? configuredPageSize, 1, MAX_PAGE_SIZE);
    const search = this.normalizeSearchQuery(query.search);
    const visibleColumns = this.filterVisibleColumns(selectedView.columns, visibility);
    const visibleColumnFields = this.extractColumnFieldPaths(visibleColumns);
    this.ensureVisibleFields(visibleColumnFields, visibility, 'No visible list field available');
    const lookupProjectionFields = await this.resolveLookupProjectionFields(
      selectedView.query.object,
      visibleColumnFields
    );

    const scopedQuery = await this.buildSoqlFromQueryConfig(selectedView.query, {
      ignoreConfiguredLimit: true,
      search,
      searchConfig: selectedView.search,
      extraFields: lookupProjectionFields,
      visibility
    });
    const paginationResult = await this.executeCursorPaginatedQuery({
      user,
      cursor: query.cursor,
      cursorKind: 'list',
      queryKind: 'ENTITY_LIST',
      entityId,
      objectApiName: selectedView.query.object,
      pageSize,
      resolvedSoql: scopedQuery.soql,
      baseWhere: scopedQuery.baseWhere ?? '',
      finalWhere: scopedQuery.finalWhere ?? '',
      visibility,
      viewId: selectedView.id,
      search,
      selectedFields: scopedQuery.selectFields,
      metadata: {
        entityId,
        viewId: selectedView.id,
        pageSize,
        search,
        selectedFields: scopedQuery.selectFields,
      }
    });

    return {
      title: listConfig.title,
      subtitle: listConfig.subtitle,
      columns: visibleColumns,
      primaryAction: selectedView.primaryAction ?? listConfig.primaryAction,
      rowActions: selectedView.rowActions,
      records: paginationResult.records,
      total: paginationResult.totalSize,
      pageSize,
      nextCursor: paginationResult.nextCursor,
      viewId: selectedView.id,
      visibility
    };
  }

  async getEntityRecord(user: SessionUser, entityId: string, recordId: string): Promise<EntityDetailResponse> {
    const entityConfig = await this.loadEntityConfig(entityId);
    this.assertSalesforceRecordId(recordId);

    const detailConfig = entityConfig.detail;
    if (!detailConfig) {
      throw new NotFoundException(`Detail view is not configured for ${entityId}`);
    }

    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      detailConfig.query.object,
      {
        queryKind: 'ENTITY_DETAIL'
      }
    );
    const visibleSections = this.filterVisibleDetailSections(detailConfig.sections, visibility);
    const visibleRelatedLists = (detailConfig.relatedLists ?? []).map((relatedList) => ({
      ...relatedList,
      columns: this.filterVisibleColumns(relatedList.columns, visibility)
    }));
    const detailFieldNames = this.collectDetailFieldNames(
      {
        ...entityConfig,
        detail: {
          ...detailConfig,
          sections: visibleSections
        }
      },
      detailConfig.query
    );
    this.ensureVisibleFields(detailFieldNames, visibility, 'No visible detail field available');
    const lookupProjectionFields = await this.resolveLookupProjectionFields(detailConfig.query.object, detailFieldNames);

    const scopedQuery = await this.buildSoqlFromQueryConfig(detailConfig.query, {
      context: { id: recordId, recordId },
      forcedLimit: 1,
      extraFields: lookupProjectionFields,
      visibility
    });
    const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'ENTITY_DETAIL',
      targetId: entityId,
      objectApiName: detailConfig.query.object,
      recordId,
      resolvedSoql: scopedQuery.soql,
      visibility,
      baseWhere: scopedQuery.baseWhere,
      finalWhere: scopedQuery.finalWhere,
      metadata: {
        entityId,
        selectedFields: scopedQuery.selectFields,
      }
    });
    const { records } = this.extractRecords(rawQueryResult);

    if (records.length === 0) {
      throw new NotFoundException(`Record ${recordId} not found`);
    }

    const record = records[0];
    const fieldDefinitions = await this.buildFieldDefinitions(
      detailConfig.query.object,
      detailFieldNames
    );

    const title = this.resolveDetailTitle(detailConfig.titleTemplate, detailConfig.fallbackTitle, record, entityConfig);
    const subtitle = this.renderRecordTemplate(detailConfig.subtitle, record);

    return {
      title,
      subtitle,
      sections: visibleSections,
      actions: detailConfig.actions,
      pathStatus: detailConfig.pathStatus,
      record,
      data: record,
      relatedLists: visibleRelatedLists,
      fieldDefinitions,
      visibility
    };
  }

  async getEntityForm(user: SessionUser, entityId: string, recordId?: string): Promise<EntityFormResponse> {
    const entityConfig = await this.loadEntityConfig(entityId);

    const formConfig = entityConfig.form;
    if (!formConfig || !formConfig.sections || formConfig.sections.length === 0) {
      throw new NotFoundException(`Form is not configured for ${entityId}`);
    }

    if (recordId) {
      this.assertSalesforceRecordId(recordId);
    }

    const sections = this.resolveFormSections(formConfig.sections);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      formConfig.query.object,
      {
        queryKind: 'ENTITY_FORM'
      }
    );
    const visibleSections = sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => this.isFieldVisible(field.field, visibility))
      }))
      .filter((section) => section.fields.length > 0);
    const visibleFormFields = this.collectFormFieldNames(visibleSections);
    this.ensureVisibleFields(visibleFormFields, visibility, 'No visible form field available');
    const fieldDefinitions = await this.buildFieldDefinitions(entityConfig.objectApiName, visibleFormFields);
    const formTitle = recordId ? formConfig.title?.edit : formConfig.title?.create;
    const title = formTitle && formTitle.trim().length > 0 ? formTitle : `${recordId ? 'Edit' : 'New'} ${entityConfig.label ?? entityConfig.id}`;

    if (!recordId) {
      await this.visibilityService.recordAudit({
        evaluation: visibility,
        queryKind: 'ENTITY_FORM',
        rowCount: 0,
        durationMs: 0
      });
      return {
        title,
        subtitle: formConfig.subtitle,
        sections: visibleSections,
        fieldDefinitions,
        visibility
      };
    }

    if (!formConfig.query) {
      throw new NotFoundException(`Form query is not configured for ${entityId}`);
    }

    const scopedQuery = await this.buildSoqlFromQueryConfig(formConfig.query, {
      context: { id: recordId, recordId },
      forcedLimit: 1,
      visibility
    });
    const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'ENTITY_FORM',
      targetId: entityId,
      objectApiName: formConfig.query.object,
      recordId,
      resolvedSoql: scopedQuery.soql,
      visibility,
      baseWhere: scopedQuery.baseWhere,
      finalWhere: scopedQuery.finalWhere,
      metadata: {
        entityId,
        recordId,
        selectedFields: scopedQuery.selectFields,
      }
    });
    const { records } = this.extractRecords(rawQueryResult);

    if (records.length === 0) {
      throw new NotFoundException(`Record ${recordId} not found`);
    }

    const record = records[0];

    return {
      title,
      subtitle: this.renderRecordTemplate(formConfig.subtitle, record),
      sections: visibleSections,
      values: record,
      record,
      fieldDefinitions,
      visibility
    };
  }

  async getEntityRelatedList(
    user: SessionUser,
    entityId: string,
    relatedListId: string,
    params: GetEntityRelatedListDto
  ): Promise<EntityRelatedListResponse> {
    await this.entityQueryCursorService.deleteExpiredCursors();
    const entityConfig = await this.loadEntityConfig(entityId);

    const recordId = params.recordId?.trim() ?? '';
    if (!recordId) {
      throw new BadRequestException('recordId query parameter is required');
    }
    this.assertSalesforceRecordId(recordId);

    const relatedLists = entityConfig.detail?.relatedLists ?? [];
    const relatedList = relatedLists.find((entry) => entry.id === relatedListId);
    if (!relatedList) {
      throw new NotFoundException(`Related list ${relatedListId} is not configured for ${entityId}`);
    }

    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      relatedList.query.object,
      {
        queryKind: 'ENTITY_RELATED_LIST'
      }
    );
    const configuredPageSize = this.clamp(relatedList.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const pageSize = this.clamp(params.pageSize ?? configuredPageSize, 1, MAX_PAGE_SIZE);
    const visibleColumns = this.filterVisibleColumns(relatedList.columns, visibility);
    const visibleColumnFields = this.extractColumnFieldPaths(visibleColumns);
    this.ensureVisibleFields(visibleColumnFields, visibility, 'No visible related-list field available');
    const lookupProjectionFields = await this.resolveLookupProjectionFields(
      relatedList.query.object,
      visibleColumnFields
    );

    const scopedQuery = await this.buildSoqlFromQueryConfig(relatedList.query, {
      context: { id: recordId, recordId },
      ignoreConfiguredLimit: true,
      extraFields: lookupProjectionFields,
      visibility
    });
    const paginationResult = await this.executeCursorPaginatedQuery({
      user,
      cursor: params.cursor,
      cursorKind: 'related-list',
      queryKind: 'ENTITY_RELATED_LIST',
      entityId,
      objectApiName: relatedList.query.object,
      pageSize,
      resolvedSoql: scopedQuery.soql,
      baseWhere: scopedQuery.baseWhere ?? '',
      finalWhere: scopedQuery.finalWhere ?? '',
      visibility,
      recordId,
      relatedListId,
      selectedFields: scopedQuery.selectFields,
      metadata: {
        entityId,
        relatedListId,
        recordId,
        pageSize,
        selectedFields: scopedQuery.selectFields,
      }
    });

    return {
      relatedList,
      title: relatedList.label,
      columns: visibleColumns,
      actions: relatedList.actions,
      rowActions: relatedList.rowActions,
      emptyState: relatedList.emptyState,
      records: paginationResult.records,
      total: paginationResult.totalSize,
      pageSize,
      nextCursor: paginationResult.nextCursor,
      visibility
    };
  }

  async createEntityRecord(
    user: SessionUser,
    entityId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    const entityConfig = await this.loadEntityConfig(entityId);
    const visibility = await this.authorizeEntityWriteAccess(
      user,
      entityId,
      entityConfig.objectApiName,
      ENTITY_CREATE_QUERY_KIND
    );
    const values = await this.normalizeWritePayload(entityConfig, payload, 'create');
    await this.recordWriteVisibilityAudit(visibility, ENTITY_CREATE_QUERY_KIND);
    const auditId = await this.auditWriteService.createApplicationIntentOrThrow({
      contactId: user.sub,
      action: ENTITY_CREATE_QUERY_KIND,
      targetType: 'entity-record',
      targetId: entityId,
      objectApiName: entityConfig.objectApiName,
      payload: values,
      metadata: {
        entityId
      }
    });

    try {
      const result = await this.salesforceService.createRecord(entityConfig.objectApiName, values);
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'SUCCESS',
        result: {
          id: typeof result.id === 'string' ? result.id : undefined,
          success: result.success === true
        }
      });
      return result;
    } catch (error) {
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'FAILURE',
        errorCode: this.auditWriteService.normalizeErrorCode(error),
        result: {
          message: error instanceof Error ? error.message : 'unknown error'
        }
      });
      throw error;
    }
  }

  async updateEntityRecord(
    user: SessionUser,
    entityId: string,
    recordId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    this.assertSalesforceRecordId(recordId);
    const entityConfig = await this.loadEntityConfig(entityId);
    const visibility = await this.authorizeEntityWriteAccess(
      user,
      entityId,
      entityConfig.objectApiName,
      ENTITY_UPDATE_QUERY_KIND
    );
    await this.assertRecordInWriteScope(
      user,
      entityId,
      entityConfig.objectApiName,
      recordId,
      visibility,
      ENTITY_UPDATE_PREFLIGHT_QUERY_KIND,
      'update'
    );
    const values = await this.normalizeWritePayload(entityConfig, payload, 'update');
    await this.recordWriteVisibilityAudit(visibility, ENTITY_UPDATE_QUERY_KIND);
    const auditId = await this.auditWriteService.createApplicationIntentOrThrow({
      contactId: user.sub,
      action: ENTITY_UPDATE_QUERY_KIND,
      targetType: 'entity-record',
      targetId: recordId,
      objectApiName: entityConfig.objectApiName,
      recordId,
      payload: values,
      metadata: {
        entityId
      }
    });

    try {
      const result = await this.salesforceService.updateRecord(entityConfig.objectApiName, recordId, values);
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'SUCCESS',
        result: {
          id: typeof result.id === 'string' ? result.id : recordId,
          success: result.success === true
        }
      });
      return result;
    } catch (error) {
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'FAILURE',
        errorCode: this.auditWriteService.normalizeErrorCode(error),
        result: {
          message: error instanceof Error ? error.message : 'unknown error'
        }
      });
      throw error;
    }
  }

  async deleteEntityRecord(user: SessionUser, entityId: string, recordId: string): Promise<void> {
    this.assertSalesforceRecordId(recordId);
    const entityConfig = await this.loadEntityConfig(entityId);
    const visibility = await this.authorizeEntityWriteAccess(
      user,
      entityId,
      entityConfig.objectApiName,
      ENTITY_DELETE_QUERY_KIND
    );
    await this.assertRecordInWriteScope(
      user,
      entityId,
      entityConfig.objectApiName,
      recordId,
      visibility,
      ENTITY_DELETE_PREFLIGHT_QUERY_KIND,
      'delete'
    );
    await this.recordWriteVisibilityAudit(visibility, ENTITY_DELETE_QUERY_KIND);
    const auditId = await this.auditWriteService.createApplicationIntentOrThrow({
      contactId: user.sub,
      action: ENTITY_DELETE_QUERY_KIND,
      targetType: 'entity-record',
      targetId: recordId,
      objectApiName: entityConfig.objectApiName,
      recordId,
      metadata: {
        entityId
      }
    });

    try {
      await this.salesforceService.deleteRecord(entityConfig.objectApiName, recordId);
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'SUCCESS',
        result: {
          id: recordId,
          success: true
        }
      });
    } catch (error) {
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'FAILURE',
        errorCode: this.auditWriteService.normalizeErrorCode(error),
        result: {
          message: error instanceof Error ? error.message : 'unknown error'
        }
      });
      throw error;
    }
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

  private async executeCursorPaginatedQuery(
    input: EntityCursorExecutionInput
  ): Promise<EntityCursorExecutionResult> {
    const queryFingerprint = this.buildEntityQueryFingerprint(input);

    if (input.cursor) {
      const cursor = await this.entityQueryCursorService.readCursor(input.cursor);
      this.assertCursorMatches(cursor, {
        ...input,
        queryFingerprint
      });

      return this.materializeCursorPage({
        input,
        sourceLocator: cursor.sourceLocator,
        sourceRecords: cursor.sourceRecords,
        queryFingerprint,
        totalSize: cursor.totalSize
      });
    }

    const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryPageWithAudit({
      contactId: input.user.sub,
      queryKind: input.queryKind,
      targetId: input.entityId,
      objectApiName: input.objectApiName,
      resolvedSoql: input.resolvedSoql,
      visibility: input.visibility,
      recordId: input.recordId,
      baseWhere: input.baseWhere,
      finalWhere: input.finalWhere,
      pageSize: input.pageSize,
      metadata: {
        ...input.metadata,
        paginationMode: 'cursor',
        cursorPhase: 'initial'
      }
    });
    const { records, totalSize } = this.extractRecords(rawQueryResult);
    const pageRecords = records.slice(0, input.pageSize);
    const remainingRecords = records.slice(input.pageSize);
    const nextCursor =
      remainingRecords.length > 0 || rawQueryResult.nextRecordsUrl
        ? await this.entityQueryCursorService.createCursor(
            this.buildEntityCursorScope(input, queryFingerprint, totalSize),
            {
              sourceLocator: rawQueryResult.nextRecordsUrl,
              sourceRecords: remainingRecords
            }
          )
        : null;

    return {
      records: pageRecords,
      totalSize,
      nextCursor
    };
  }

  private async materializeCursorPage(params: {
    input: EntityCursorExecutionInput;
    sourceLocator?: string;
    sourceRecords: Array<Record<string, unknown>>;
    queryFingerprint: string;
    totalSize: number;
  }): Promise<EntityCursorExecutionResult> {
    const workingRecords = [...params.sourceRecords];
    let locator = params.sourceLocator;

    while (workingRecords.length < params.input.pageSize && locator) {
      const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryMoreWithAudit({
        contactId: params.input.user.sub,
        queryKind: params.input.queryKind,
        targetId: params.input.entityId,
        objectApiName: params.input.objectApiName,
        resolvedSoql: params.input.resolvedSoql,
        visibility: params.input.visibility,
        recordId: params.input.recordId,
        baseWhere: params.input.baseWhere,
        finalWhere: params.input.finalWhere,
        locator,
        pageSize: params.input.pageSize,
        metadata: {
          ...params.input.metadata,
          paginationMode: 'cursor',
          cursorPhase: 'continue'
        }
      });
      const { records } = this.extractRecords(rawQueryResult);
      workingRecords.push(...records);
      locator = rawQueryResult.nextRecordsUrl;
    }

    const pageRecords = workingRecords.slice(0, params.input.pageSize);
    const remainingRecords = workingRecords.slice(params.input.pageSize);
    const nextCursor =
      remainingRecords.length > 0 || locator
        ? await this.entityQueryCursorService.createCursor(
            this.buildEntityCursorScope(params.input, params.queryFingerprint, params.totalSize),
            {
              sourceLocator: locator,
              sourceRecords: remainingRecords
            }
          )
        : null;

    return {
      records: pageRecords,
      totalSize: params.totalSize,
      nextCursor
    };
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
  ) {
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
    cursor: Awaited<ReturnType<EntityQueryCursorService['readCursor']>>,
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

  private async buildSoqlFromQueryConfig(
    query: EntityQueryConfig,
    options: SoqlBuildOptions
  ): Promise<{ soql: string; baseWhere?: string; finalWhere?: string; selectFields: string[] }> {
    const objectApiName = this.toSoqlIdentifier(query.object);
    const queryFields = Array.isArray(query.fields) && query.fields.length > 0 ? query.fields : ['Id'];
    const extraFields = Array.isArray(options.extraFields) ? options.extraFields : [];
    const requestedFields = this.uniqueValues(['Id', ...queryFields, ...extraFields]);
    const visibleRequestedFields = options.visibility
      ? this.visibilityService.applyFieldVisibility(requestedFields, options.visibility)
      : requestedFields;

    if (visibleRequestedFields.length === 0) {
      throw new ForbiddenException('Visibility denied all requested fields');
    }

    const selectFields = visibleRequestedFields.map((field) => this.toSoqlIdentifier(field));

    const context = options.context ?? {};
    const whereConditions = this.compileWhereConditions(query.where ?? [], context);
    const searchCondition = await this.buildSearchCondition(query.object, options.search, options.searchConfig);
    if (searchCondition) {
      whereConditions.push(searchCondition);
    }

    const baseWhere = whereConditions.length > 0 ? whereConditions.join(' AND ') : undefined;
    const finalWhere = this.composeVisibilityWhere(baseWhere, options.visibility?.compiledPredicate);
    const whereClause = finalWhere ? ` WHERE ${finalWhere}` : '';
    const orderByClause = this.compileOrderByClause(query);

    const limitFromConfig = Number.isInteger(query.limit) && Number(query.limit) > 0 ? Number(query.limit) : undefined;
    const limit =
      typeof options.forcedLimit === 'number'
        ? options.forcedLimit
        : options.ignoreConfiguredLimit === true
          ? undefined
          : limitFromConfig;
    const limitClause = typeof limit === 'number' ? ` LIMIT ${limit}` : '';

    return {
      soql: `SELECT ${selectFields.join(', ')} FROM ${objectApiName}${whereClause}${orderByClause}${limitClause}`,
      baseWhere,
      finalWhere,
      selectFields
    };
  }

  private compileWhereConditions(entries: EntityQueryWhere[], context: Record<string, unknown>): string[] {
    const conditions: string[] = [];

    for (const entry of entries) {
      const compiled = this.compileWhereEntry(entry, context);
      if (compiled) {
        conditions.push(compiled);
      }
    }

    return conditions;
  }

  private compileWhereEntry(entry: EntityQueryWhere, context: Record<string, unknown>): string | null {
    const field = this.toSoqlIdentifier(entry.field);
    const operator = entry.operator;
    const resolvedValue = this.resolveQueryValue(entry.value, context);

    if (resolvedValue === null) {
      if (operator === '=') {
        return `${field} IS NULL`;
      }

      if (operator === '!=') {
        return `${field} IS NOT NULL`;
      }

      throw new BadRequestException(`Operator ${operator} does not accept null`);
    }

    if (Array.isArray(resolvedValue)) {
      if (operator !== 'IN' && operator !== 'NOT IN') {
        throw new BadRequestException(`Operator ${operator} does not accept an array value`);
      }

      const serializedArray = resolvedValue.map((value) => this.serializeSoqlValue(value)).join(', ');
      return `${field} ${operator} (${serializedArray})`;
    }

    return `${field} ${operator} ${this.serializeSoqlValue(resolvedValue)}`;
  }

  private resolveQueryValue(
    value: EntityQueryScalarValue | EntityQueryScalarValue[],
    context: Record<string, unknown>
  ): EntityQueryScalarValue | EntityQueryScalarValue[] {
    if (Array.isArray(value)) {
      return value.map((entry) => this.resolveScalarQueryValue(entry, context));
    }

    return this.resolveScalarQueryValue(value, context);
  }

  private resolveScalarQueryValue(
    value: EntityQueryScalarValue,
    context: Record<string, unknown>
  ): EntityQueryScalarValue {
    if (typeof value !== 'string') {
      return value;
    }

    const singleTokenMatch = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.exec(value);
    if (singleTokenMatch) {
      const tokenValue = context[singleTokenMatch[1]];
      return this.normalizeTemplateValue(tokenValue);
    }

    return this.renderTemplate(value, context);
  }

  private normalizeTemplateValue(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    return String(value);
  }

  private async buildSearchCondition(
    objectApiName: string,
    search: string | undefined,
    searchConfig: EntityListSearchConfig | undefined
  ): Promise<string | null> {
    if (!search) {
      return null;
    }

    const minLength = Number.isInteger(searchConfig?.minLength) ? Number(searchConfig?.minLength) : 2;
    if (search.length < minLength) {
      return null;
    }

    const configuredFields = Array.isArray(searchConfig?.fields) ? searchConfig.fields : [];
    const validConfiguredFields = configuredFields.filter((field) => SOQL_IDENTIFIER_PATTERN.test(field));
    if (validConfiguredFields.length === 0) {
      return null;
    }

    const describeMap = await this.getDescribeFieldMap(objectApiName);
    const searchClauses: string[] = [];

    for (const fieldName of validConfiguredFields) {
      const describe = describeMap.get(fieldName);
      if (!describe || !describe.filterable) {
        continue;
      }

      const normalizedType = describe.type.toLowerCase();
      if (TEXT_SEARCH_TYPES.has(normalizedType)) {
        searchClauses.push(`${fieldName} LIKE '%${this.escapeSoqlLiteral(search)}%'`);
        continue;
      }

      if (NUMERIC_SEARCH_TYPES.has(normalizedType)) {
        const numericValue = Number(search);
        if (Number.isFinite(numericValue)) {
          searchClauses.push(`${fieldName} = ${numericValue}`);
        }

        continue;
      }

      if (normalizedType === 'boolean') {
        const normalizedBoolean = search.toLowerCase();
        if (normalizedBoolean === 'true' || normalizedBoolean === 'false') {
          searchClauses.push(`${fieldName} = ${normalizedBoolean.toUpperCase()}`);
        }
      }
    }

    if (searchClauses.length === 0) {
      return null;
    }

    return `(${searchClauses.join(' OR ')})`;
  }

  private compileOrderByClause(query: EntityQueryConfig): string {
    if (!Array.isArray(query.orderBy) || query.orderBy.length === 0) {
      return '';
    }

    const segments = query.orderBy
      .map((entry) => {
        if (!entry.field || entry.field.trim().length === 0) {
          return null;
        }

        const field = this.toSoqlIdentifier(entry.field);
        const direction = entry.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        return `${field} ${direction}`;
      })
      .filter((entry): entry is string => entry !== null);

    return segments.length > 0 ? ` ORDER BY ${segments.join(', ')}` : '';
  }

  private collectDetailFieldNames(entityConfig: EntityConfig, query: EntityQueryConfig): string[] {
    const sectionFields = (entityConfig.detail?.sections ?? [])
      .flatMap((section) => section.fields ?? [])
      .map((fieldConfig) => fieldConfig.field)
      .filter((fieldName): fieldName is string => typeof fieldName === 'string' && fieldName.trim().length > 0);

    return this.uniqueValues(['Id', ...(query.fields ?? []), ...sectionFields]);
  }

  private extractColumnFieldPaths(columns: Array<string | { field?: unknown }>): string[] {
    const fieldPaths = columns
      .map((column) => {
        if (typeof column === 'string') {
          return column.trim();
        }

        const field = column.field;
        return typeof field === 'string' ? field.trim() : '';
      })
      .filter((fieldPath) => fieldPath.length > 0);

    return this.uniqueValues(fieldPaths);
  }

  private filterVisibleColumns(
    columns: Array<string | EntityColumnConfig>,
    visibility: VisibilityEvaluation
  ): Array<string | EntityColumnConfig> {
    return columns.filter((column) => {
      if (typeof column === 'string') {
        return this.isFieldVisible(column, visibility);
      }

      if (typeof column.field !== 'string' || column.field.trim().length === 0) {
        return true;
      }

      return this.isFieldVisible(column.field, visibility);
    });
  }

  private filterVisibleDetailSections(
    sections: NonNullable<NonNullable<EntityConfig['detail']>['sections']>,
    visibility: VisibilityEvaluation
  ): NonNullable<NonNullable<EntityConfig['detail']>['sections']> {
    return sections
      .map((section) => ({
        ...section,
        fields: (section.fields ?? []).filter((fieldConfig) =>
          typeof fieldConfig.field === 'string'
            ? this.isFieldVisible(fieldConfig.field, visibility)
            : false
        )
      }))
      .filter((section) => (section.fields ?? []).length > 0);
  }

  private isFieldVisible(fieldPath: string, visibility: VisibilityEvaluation): boolean {
    return this.visibilityService.applyFieldVisibility([fieldPath], visibility).length > 0;
  }

  private ensureVisibleFields(
    fields: string[],
    visibility: VisibilityEvaluation,
    message: string
  ): void {
    if (this.visibilityService.applyFieldVisibility(fields, visibility).length === 0) {
      throw new ForbiddenException(message);
    }
  }

  private composeVisibilityWhere(
    baseWhere: string | undefined,
    compiledPredicate: string | undefined
  ): string | undefined {
    const normalizedBase = baseWhere?.trim();
    const normalizedPredicate = compiledPredicate?.trim();

    if (!normalizedBase && !normalizedPredicate) {
      return undefined;
    }

    if (!normalizedBase) {
      return normalizedPredicate;
    }

    if (!normalizedPredicate) {
      return normalizedBase;
    }

    return `(${normalizedBase}) AND (${normalizedPredicate})`;
  }

  private async resolveLookupProjectionFields(objectApiName: string, fieldPaths: string[]): Promise<string[]> {
    if (fieldPaths.length === 0) {
      return [];
    }

    const sourceDescribeMap = await this.getDescribeFieldMap(objectApiName);
    const projections: string[] = [];

    for (const fieldPath of fieldPaths) {
      const fieldName = fieldPath.trim();
      if (!fieldName || fieldName.includes('.')) {
        continue;
      }

      const describe = sourceDescribeMap.get(fieldName);
      if (!describe || describe.type.toLowerCase() !== 'reference') {
        continue;
      }

      const relationshipName = describe.relationshipName?.trim() ?? '';
      const referenceTargets = (describe.referenceTo ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      if (!relationshipName || referenceTargets.length === 0) {
        continue;
      }

      const displayField = await this.resolveLookupDisplayFieldAcrossTargets(referenceTargets);
      if (!displayField) {
        continue;
      }

      projections.push(`${relationshipName}.${displayField}`);
    }

    return this.uniqueValues(projections);
  }

  private async resolveLookupDisplayFieldAcrossTargets(targetObjectApiNames: string[]): Promise<string | null> {
    if (targetObjectApiNames.length === 0) {
      return null;
    }

    const candidateSets: Array<Set<string>> = [];

    for (const targetObjectApiName of targetObjectApiNames) {
      try {
        const describeMap = await this.getDescribeFieldMap(targetObjectApiName);
        const candidates = this.resolveLookupDisplayFieldCandidates(describeMap);
        if (candidates.length === 0) {
          return null;
        }

        candidateSets.push(new Set(candidates));
      } catch {
        return null;
      }
    }

    for (const candidate of this.lookupDisplayFieldPriority()) {
      if (candidateSets.every((candidateSet) => candidateSet.has(candidate))) {
        return candidate;
      }
    }

    return null;
  }

  private resolveLookupDisplayFieldCandidates(describeMap: Map<string, SalesforceFieldSummary>): string[] {
    const candidates: string[] = [];
    for (const candidate of this.lookupDisplayFieldPriority()) {
      if (describeMap.has(candidate)) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  private lookupDisplayFieldPriority(): string[] {
    const candidates = ['Name', 'CaseNumber', 'Subject', 'Title'];
    return candidates;
  }

  private collectFormFieldNames(sections: EntityFormSectionResponse[]): string[] {
    return this.uniqueValues(
      sections.flatMap((section) => section.fields.map((field) => field.field)).filter((field) => field.length > 0)
    );
  }

  private resolveFormSections(formSections: NonNullable<NonNullable<EntityConfig['form']>['sections']>): EntityFormSectionResponse[] {
    return formSections
      .map((section, index) => {
        const fields = (section.fields ?? [])
          .map((fieldConfig) => this.resolveFormField(fieldConfig))
          .filter((field): field is EntityFormSectionResponse['fields'][number] => field !== null);

        if (fields.length === 0) {
          return null;
        }

        const sectionTitle = section.title && section.title.trim().length > 0 ? section.title : `Section ${index + 1}`;
        return {
          title: sectionTitle,
          fields
        };
      })
      .filter((section): section is EntityFormSectionResponse => section !== null);
  }

  private resolveFormField(fieldConfig: EntityFormFieldConfig): EntityFormSectionResponse['fields'][number] | null {
    const fieldName = fieldConfig.field?.trim() ?? '';
    if (!fieldName || !WRITE_FIELD_API_NAME_PATTERN.test(fieldName) || fieldName === 'Id') {
      return null;
    }

    const label = fieldConfig.label?.trim() || this.toFieldLabel(fieldName);

    return {
      field: fieldName,
      label,
      inputType: this.normalizeFormInputType(fieldConfig.inputType) ?? 'text',
      required: fieldConfig.required === true,
      placeholder: fieldConfig.placeholder,
      lookup: fieldConfig.lookup
    };
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
    if (!template || template.trim().length === 0) {
      return undefined;
    }

    const rendered = template.replace(TEMPLATE_TOKEN_PATTERN, (_match, rawExpr: string) => {
      const candidates = rawExpr.split('||').map((entry) => entry.trim()).filter((entry) => entry.length > 0);

      for (const candidate of candidates) {
        const value = this.resolveRecordValue(record, candidate);
        if (value !== null && value !== undefined && String(value).trim().length > 0) {
          return String(value);
        }
      }

      return '';
    });

    const normalized = rendered.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private resolveRecordValue(record: Record<string, unknown>, fieldPath: string): unknown {
    const segments = fieldPath.split('.').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    let current: unknown = record;

    for (const segment of segments) {
      if (!this.isObjectRecord(current)) {
        return undefined;
      }

      current = current[segment];
    }

    return current;
  }

  private async buildFieldDefinitions(objectApiName: string, fields: string[]): Promise<EntityFieldDefinition[]> {
    const describeMap = await this.getDescribeFieldMap(objectApiName);
    const normalizedFields = this.uniqueValues(fields).filter((field) => field.length > 0);

    return normalizedFields.map((fieldName) => {
      const describe = describeMap.get(fieldName);
      const type = describe?.type ?? 'string';

      return {
        field: fieldName,
        label: describe?.label ?? this.toFieldLabel(fieldName),
        type,
        nillable: describe?.nillable ?? true,
        createable: describe?.createable ?? false,
        updateable: describe?.updateable ?? false,
        filterable: describe?.filterable ?? false,
        inputType: this.mapFormInputType(type),
        required: describe ? !describe.nillable : false
      };
    });
  }

  private async normalizeWritePayload(
    entityConfig: EntityConfig,
    payload: unknown,
    mode: WriteMode
  ): Promise<Record<string, unknown>> {
    if (!this.isObjectRecord(payload)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    const writableFields = this.resolveWritableFieldSet(entityConfig);
    if (writableFields.size === 0) {
      throw new BadRequestException('Form writable fields are not configured for this entity');
    }

    const describeMap = await this.getDescribeFieldMap(entityConfig.objectApiName);
    const normalized: Record<string, unknown> = {};

    for (const [fieldName, rawValue] of Object.entries(payload)) {
      if (fieldName === 'Id' || fieldName === 'attributes') {
        continue;
      }

      if (!WRITE_FIELD_API_NAME_PATTERN.test(fieldName)) {
        throw new BadRequestException(`Invalid field name in payload: ${fieldName}`);
      }

      if (!writableFields.has(fieldName)) {
        continue;
      }

      const describe = describeMap.get(fieldName);
      if (!describe) {
        continue;
      }

      if (mode === 'create' && !describe.createable) {
        continue;
      }

      if (mode === 'update' && !describe.updateable) {
        continue;
      }

      normalized[fieldName] = this.normalizeFieldValue(rawValue, describe.type, fieldName);
    }

    if (Object.keys(normalized).length === 0) {
      throw new BadRequestException('No valid writable field found in payload');
    }

    return normalized;
  }

  private resolveWritableFieldSet(entityConfig: EntityConfig): Set<string> {
    const formFields = (entityConfig.form?.sections ?? [])
      .flatMap((section) => section.fields ?? [])
      .map((field) => field.field)
      .filter((fieldName): fieldName is string => typeof fieldName === 'string' && WRITE_FIELD_API_NAME_PATTERN.test(fieldName));

    const pathStatusField = entityConfig.detail?.pathStatus?.field;
    const fields = pathStatusField ? [...formFields, pathStatusField] : formFields;

    return new Set(fields.filter((fieldName) => fieldName !== 'Id'));
  }

  private normalizeFieldValue(value: unknown, fieldType: string, fieldName: string): string | number | boolean | null {
    if (value === null) {
      return null;
    }

    const normalizedType = fieldType.toLowerCase();

    if (normalizedType === 'boolean') {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') {
          return true;
        }

        if (normalized === 'false') {
          return false;
        }
      }

      throw new BadRequestException(`Invalid boolean value for field ${fieldName}`);
    }

    if (NUMERIC_SEARCH_TYPES.has(normalizedType)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      throw new BadRequestException(`Invalid numeric value for field ${fieldName}`);
    }

    if (normalizedType === 'date') {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }

      throw new BadRequestException(`Invalid date value for field ${fieldName}`);
    }

    if (normalizedType === 'datetime') {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }

      throw new BadRequestException(`Invalid datetime value for field ${fieldName}`);
    }

    if (normalizedType === 'multipicklist') {
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry)).join(';');
      }
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    throw new BadRequestException(`Invalid value type for field ${fieldName}`);
  }

  private async getDescribeFieldMap(objectApiName: string): Promise<Map<string, SalesforceFieldSummary>> {
    const fields = await this.salesforceService.describeObjectFields(objectApiName.trim());
    const typedFields = fields as SalesforceFieldSummary[];
    return new Map(typedFields.map((field) => [field.name, field]));
  }

  private extractRecords(result: unknown): { records: Array<Record<string, unknown>>; totalSize: number } {
    if (!this.isObjectRecord(result)) {
      return { records: [], totalSize: 0 };
    }

    const rawRecords = result.records;
    const records = Array.isArray(rawRecords)
      ? rawRecords.filter((record): record is Record<string, unknown> => this.isObjectRecord(record))
      : [];
    const totalSize = typeof result.totalSize === 'number' ? result.totalSize : records.length;

    return { records, totalSize };
  }

  private renderTemplate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token: string) => {
      const value = context[token];
      if (value === null || value === undefined) {
        return '';
      }

      return String(value);
    });
  }

  private serializeSoqlValue(value: string | number | boolean | null): string {
    if (value === null) {
      return 'NULL';
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException('Invalid numeric SOQL value');
      }

      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return `'${this.escapeSoqlLiteral(value)}'`;
  }

  private escapeSoqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private toSoqlIdentifier(identifier: string): string {
    if (!SOQL_IDENTIFIER_PATTERN.test(identifier)) {
      throw new BadRequestException(`Invalid SOQL identifier: ${identifier}`);
    }

    return identifier;
  }

  private mapFormInputType(salesforceType: string): FormInputType {
    const normalizedType = salesforceType.toLowerCase();

    if (normalizedType === 'email') {
      return 'email';
    }

    if (normalizedType === 'phone') {
      return 'tel';
    }

    if (normalizedType === 'date') {
      return 'date';
    }

    if (normalizedType === 'textarea' || normalizedType === 'longtextarea' || normalizedType === 'richtextarea') {
      return 'textarea';
    }

    return 'text';
  }

  private normalizeFormInputType(inputType: string | undefined): FormInputType | undefined {
    if (inputType === 'text' || inputType === 'email' || inputType === 'tel' || inputType === 'date' || inputType === 'textarea') {
      return inputType;
    }

    return undefined;
  }

  private toFieldLabel(fieldName: string): string {
    return fieldName
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[._-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (char) => char.toUpperCase());
  }

  private assertSalesforceRecordId(recordId: string): void {
    if (!SALESFORCE_ID_PATTERN.test(recordId)) {
      throw new BadRequestException('recordId must be a valid Salesforce id (15 or 18 chars)');
    }
  }

  private uniqueValues<T>(values: T[]): T[] {
    return [...new Set(values)];
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
