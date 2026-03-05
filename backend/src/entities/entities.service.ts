import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { SessionUser } from '../auth/session-user.interface';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceService } from '../salesforce/salesforce.service';
import type { VisibilityEvaluation } from '../visibility/visibility.types';

import type { GetEntityListDto } from './dto/get-entity-list.dto';
import type {
  EntityActionConfig,
  EntityConfig,
  EntityFormFieldConfig,
  EntityListSearchConfig,
  EntityListViewConfig,
  EntityPathStatusConfig,
  EntityQueryConfig,
  EntityQueryWhere
} from './entities.types';
import { EntityConfigRepository } from './services/entity-config.repository';

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
  page?: number;
  pageSize?: number;
  forcedLimit?: number;
  search?: string;
  searchConfig?: EntityListSearchConfig;
}

interface EntityListResponse {
  title: string;
  subtitle?: string;
  columns: EntityListViewConfig['columns'];
  primaryAction?: EntityActionConfig;
  rowActions?: EntityActionConfig[];
  records: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
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
  page: number;
  pageSize: number;
  visibility: VisibilityEvaluation;
}

@Injectable()
export class EntitiesService {
  constructor(
    private readonly resourceAccessService: ResourceAccessService,
    private readonly entityConfigRepository: EntityConfigRepository,
    private readonly salesforceService: SalesforceService
  ) {}

  async getEntity(
    user: SessionUser,
    entityId: string
  ): Promise<{ entity: EntityConfig; visibility: VisibilityEvaluation }> {
    const { entityConfig, visibility } = await this.loadAuthorizedEntityConfig(user, entityId);

    return {
      entity: entityConfig,
      visibility
    };
  }

  async getEntityList(user: SessionUser, entityId: string, query: GetEntityListDto): Promise<EntityListResponse> {
    const { entityConfig, visibility } = await this.loadAuthorizedEntityConfig(user, entityId);
    const listConfig = entityConfig.list;

    if (!listConfig || listConfig.views.length === 0) {
      throw new NotFoundException(`List view is not configured for ${entityId}`);
    }

    const selectedView = this.selectListView(listConfig.views, query.viewId);
    const page = this.clamp(query.page ?? 1, 1, Number.MAX_SAFE_INTEGER);
    const configuredPageSize = this.clamp(selectedView.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const pageSize = this.clamp(query.pageSize ?? configuredPageSize, 1, MAX_PAGE_SIZE);
    const search = this.normalizeSearchQuery(query.search);

    const soql = await this.buildSoqlFromQueryConfig(selectedView.query, {
      page,
      pageSize,
      search,
      searchConfig: selectedView.search
    });

    const rawQueryResult = await this.salesforceService.executeReadOnlyQuery(soql);
    const { records, totalSize } = this.extractRecords(rawQueryResult);

    return {
      title: listConfig.title,
      subtitle: listConfig.subtitle,
      columns: selectedView.columns,
      primaryAction: selectedView.primaryAction ?? listConfig.primaryAction,
      rowActions: selectedView.rowActions,
      records,
      total: totalSize,
      page,
      pageSize,
      viewId: selectedView.id,
      visibility
    };
  }

  async getEntityRecord(user: SessionUser, entityId: string, recordId: string): Promise<EntityDetailResponse> {
    const { entityConfig, visibility } = await this.loadAuthorizedEntityConfig(user, entityId);
    this.assertSalesforceRecordId(recordId);

    const detailConfig = entityConfig.detail;
    if (!detailConfig) {
      throw new NotFoundException(`Detail view is not configured for ${entityId}`);
    }

    const soql = await this.buildSoqlFromQueryConfig(detailConfig.query, {
      context: { id: recordId, recordId },
      forcedLimit: 1
    });
    const rawQueryResult = await this.salesforceService.executeReadOnlyQuery(soql);
    const { records } = this.extractRecords(rawQueryResult);

    if (records.length === 0) {
      throw new NotFoundException(`Record ${recordId} not found`);
    }

    const record = records[0];
    const fieldDefinitions = await this.buildFieldDefinitions(
      detailConfig.query.object,
      this.collectDetailFieldNames(entityConfig, detailConfig.query)
    );

    const title = this.resolveDetailTitle(detailConfig.titleTemplate, detailConfig.fallbackTitle, record, entityConfig);
    const subtitle = this.renderRecordTemplate(detailConfig.subtitle, record);

    return {
      title,
      subtitle,
      sections: detailConfig.sections,
      actions: detailConfig.actions,
      pathStatus: detailConfig.pathStatus,
      record,
      data: record,
      relatedLists: detailConfig.relatedLists,
      fieldDefinitions,
      visibility
    };
  }

  async getEntityForm(user: SessionUser, entityId: string, recordId?: string): Promise<EntityFormResponse> {
    const { entityConfig, visibility } = await this.loadAuthorizedEntityConfig(user, entityId);

    const formConfig = entityConfig.form;
    if (!formConfig || !formConfig.sections || formConfig.sections.length === 0) {
      throw new NotFoundException(`Form is not configured for ${entityId}`);
    }

    if (recordId) {
      this.assertSalesforceRecordId(recordId);
    }

    const sections = this.resolveFormSections(formConfig.sections);
    const fieldDefinitions = await this.buildFieldDefinitions(entityConfig.objectApiName, this.collectFormFieldNames(sections));
    const formTitle = recordId ? formConfig.title?.edit : formConfig.title?.create;
    const title = formTitle && formTitle.trim().length > 0 ? formTitle : `${recordId ? 'Edit' : 'New'} ${entityConfig.label ?? entityConfig.id}`;

    if (!recordId) {
      return {
        title,
        subtitle: formConfig.subtitle,
        sections,
        fieldDefinitions,
        visibility
      };
    }

    if (!formConfig.query) {
      throw new NotFoundException(`Form query is not configured for ${entityId}`);
    }

    const soql = await this.buildSoqlFromQueryConfig(formConfig.query, {
      context: { id: recordId, recordId },
      forcedLimit: 1
    });

    const rawQueryResult = await this.salesforceService.executeReadOnlyQuery(soql);
    const { records } = this.extractRecords(rawQueryResult);

    if (records.length === 0) {
      throw new NotFoundException(`Record ${recordId} not found`);
    }

    const record = records[0];

    return {
      title,
      subtitle: this.renderRecordTemplate(formConfig.subtitle, record),
      sections,
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
    params: { recordId?: string; page?: number; pageSize?: number }
  ): Promise<EntityRelatedListResponse> {
    const { entityConfig, visibility } = await this.loadAuthorizedEntityConfig(user, entityId);

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

    const page = this.clamp(params.page ?? 1, 1, Number.MAX_SAFE_INTEGER);
    const configuredPageSize = this.clamp(relatedList.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const pageSize = this.clamp(params.pageSize ?? configuredPageSize, 1, MAX_PAGE_SIZE);

    const soql = await this.buildSoqlFromQueryConfig(relatedList.query, {
      context: { id: recordId, recordId },
      page,
      pageSize
    });
    const rawQueryResult = await this.salesforceService.executeReadOnlyQuery(soql);
    const { records, totalSize } = this.extractRecords(rawQueryResult);

    return {
      relatedList,
      title: relatedList.label,
      columns: relatedList.columns,
      actions: relatedList.actions,
      rowActions: relatedList.rowActions,
      emptyState: relatedList.emptyState,
      records,
      total: totalSize,
      page,
      pageSize,
      visibility
    };
  }

  async createEntityRecord(
    user: SessionUser,
    entityId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    const { entityConfig } = await this.loadAuthorizedEntityConfig(user, entityId);
    const values = await this.normalizeWritePayload(entityConfig, payload, 'create');
    return this.salesforceService.createRecord(entityConfig.objectApiName, values);
  }

  async updateEntityRecord(
    user: SessionUser,
    entityId: string,
    recordId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    this.assertSalesforceRecordId(recordId);
    const { entityConfig } = await this.loadAuthorizedEntityConfig(user, entityId);
    const values = await this.normalizeWritePayload(entityConfig, payload, 'update');
    return this.salesforceService.updateRecord(entityConfig.objectApiName, recordId, values);
  }

  async deleteEntityRecord(user: SessionUser, entityId: string, recordId: string): Promise<void> {
    this.assertSalesforceRecordId(recordId);
    const { entityConfig } = await this.loadAuthorizedEntityConfig(user, entityId);
    await this.salesforceService.deleteRecord(entityConfig.objectApiName, recordId);
  }

  private async loadAuthorizedEntityConfig(
    user: SessionUser,
    entityId: string
  ): Promise<{ entityConfig: EntityConfig; visibility: VisibilityEvaluation }> {
    this.resourceAccessService.assertKebabCaseId(entityId, 'entityId');

    const entityConfig = await this.entityConfigRepository.getEntityConfig(entityId);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      entityConfig.objectApiName
    );

    return { entityConfig, visibility };
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

  private async buildSoqlFromQueryConfig(query: EntityQueryConfig, options: SoqlBuildOptions): Promise<string> {
    const objectApiName = this.toSoqlIdentifier(query.object);
    const queryFields = Array.isArray(query.fields) && query.fields.length > 0 ? query.fields : ['Id'];
    const selectFields = this.uniqueValues(['Id', ...queryFields]).map((field) => this.toSoqlIdentifier(field));

    const context = options.context ?? {};
    const whereConditions = this.compileWhereConditions(query.where ?? [], context);
    const searchCondition = await this.buildSearchCondition(query.object, options.search, options.searchConfig);
    if (searchCondition) {
      whereConditions.push(searchCondition);
    }

    const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : '';
    const orderByClause = this.compileOrderByClause(query);

    const limitFromConfig = Number.isInteger(query.limit) && Number(query.limit) > 0 ? Number(query.limit) : undefined;
    const limit = options.forcedLimit ?? options.pageSize ?? limitFromConfig;
    const limitClause = typeof limit === 'number' ? ` LIMIT ${limit}` : '';

    const offset =
      typeof options.page === 'number' && typeof options.pageSize === 'number'
        ? (options.page - 1) * options.pageSize
        : undefined;
    const offsetClause = typeof offset === 'number' && offset > 0 ? ` OFFSET ${offset}` : '';

    return `SELECT ${selectFields.join(', ')} FROM ${objectApiName}${whereClause}${orderByClause}${limitClause}${offsetClause}`;
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
    if (typeof entry === 'string') {
      const raw = this.renderTemplate(entry, context).trim();
      return raw.length > 0 ? raw : null;
    }

    if (entry.raw && entry.raw.trim().length > 0) {
      const raw = this.renderTemplate(entry.raw, context).trim();
      return raw.length > 0 ? raw : null;
    }

    if (!entry.field || entry.field.trim().length === 0) {
      return null;
    }

    const field = this.toSoqlIdentifier(entry.field);
    const operator = (entry.operator ?? '=').trim().toUpperCase();
    const resolvedValue = this.resolveQueryValue(entry.value, context);

    if (resolvedValue === null) {
      if (operator === '=') {
        return `${field} IS NULL`;
      }

      if (operator === '!=') {
        return `${field} IS NOT NULL`;
      }
    }

    if (Array.isArray(resolvedValue)) {
      if (resolvedValue.length === 0) {
        return null;
      }

      const serializedArray = resolvedValue.map((value) => this.serializeSoqlValue(value)).join(', ');
      return `${field} ${operator} (${serializedArray})`;
    }

    return `${field} ${operator} ${this.serializeSoqlValue(resolvedValue)}`;
  }

  private resolveQueryValue(
    value: string | number | boolean | null | Array<string | number | boolean | null> | undefined,
    context: Record<string, unknown>
  ): string | number | boolean | null | Array<string | number | boolean | null> {
    if (value === undefined) {
      return '';
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.resolveScalarQueryValue(entry, context));
    }

    return this.resolveScalarQueryValue(value, context);
  }

  private resolveScalarQueryValue(
    value: string | number | boolean | null,
    context: Record<string, unknown>
  ): string | number | boolean | null {
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
