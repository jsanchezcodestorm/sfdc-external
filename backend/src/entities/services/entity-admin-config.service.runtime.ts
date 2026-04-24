import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AclAdminConfigService } from '../../acl/acl-admin-config.service';
import type { AclDerivedResourceStatus } from '../../acl/acl-admin.types';
import { AclResourceSyncService } from '../../acl/acl-resource-sync.service';
import { AclService } from '../../acl/acl.service';
import { AuditWriteService } from '../../audit/audit-write.service';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import { SalesforceService } from '../../salesforce/salesforce.service';
import { VisibilityAdminService } from '../../visibility/visibility-admin.service';
import {
  EntityActionConfig,
  EntityConfig,
  EntityDetailConfig,
  EntityDetailSectionConfig,
  EntityFormConfig,
  EntityFormSectionConfig,
  EntityListConfig,
  EntityListViewConfig,
  EntityRelatedListConfig
} from '../entities.types';
import { normalizeEntityFormFieldConfig } from '../entity-form-config.validation';
import { normalizeEntityQueryConfig } from '../entity-query-config.validation';

import { EntityAdminConfigRepository, EntityAdminConfigSummary } from './entity-admin-config.repository';

export interface EntityAdminConfigListResponse {
  items: Array<EntityAdminConfigSummary & { aclResourceStatus: AclDerivedResourceStatus }>;
}

export interface UpsertEntityAdminConfigPayload {
  entity: unknown;
}

export interface EntityAdminConfigResponse {
  entity: EntityConfig;
  aclResourceStatus: AclDerivedResourceStatus;
}

export interface EntityAdminBootstrapPreviewResponse {
  entity: EntityConfig;
  warnings: string[];
}

interface SalesforceObjectSuggestion {
  name: string;
  label: string;
  custom: boolean;
}

interface SalesforceObjectSuggestionCache {
  fetchedAtMs: number;
  items: SalesforceObjectSuggestion[];
}

interface SalesforceFieldSuggestion {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

interface SalesforceFieldDescribe {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  defaultedOnCreate?: boolean;
  calculated?: boolean;
  autoNumber?: boolean;
  relationshipName?: string;
  referenceTo?: string[];
}

interface SalesforceFieldSuggestionCache {
  fetchedAtMs: number;
  items: SalesforceFieldSuggestion[];
}

interface BootstrapListPreset {
  config: EntityListConfig;
  displayFieldNames: string[];
}

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

const DETAIL_FORMAT_FIELD_TYPES = new Set(['date', 'datetime']);
const MAX_LIST_DISPLAY_FIELDS = 5;
const MAX_DETAIL_EXTRA_FIELDS = 6;
const MAX_DETAIL_OVERVIEW_FIELDS = 4;
const MAX_FORM_FIELDS = 12;
const MAX_FORM_SECTION_FIELDS = 6;

@Injectable()
export class EntityAdminConfigRuntimeService {
  private readonly salesforceObjectCacheTtlMs = 5 * 60 * 1000;
  private readonly salesforceFieldCacheTtlMs = 5 * 60 * 1000;
  private salesforceObjectCache: SalesforceObjectSuggestionCache | null = null;
  private salesforceObjectRefreshPromise: Promise<SalesforceObjectSuggestion[]> | null = null;
  private readonly salesforceFieldCache = new Map<string, SalesforceFieldSuggestionCache>();
  private readonly salesforceFieldRefreshPromises = new Map<string, Promise<SalesforceFieldSuggestion[]>>();

  constructor(
    private readonly aclAdminConfigService: AclAdminConfigService,
    private readonly aclService: AclService,
    private readonly visibilityAdminService: VisibilityAdminService,
    private readonly aclResourceSyncService: AclResourceSyncService,
    private readonly auditWriteService: AuditWriteService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly repository: EntityAdminConfigRepository,
    private readonly salesforceService: SalesforceService
  ) {}

  async listEntityConfigs(): Promise<EntityAdminConfigListResponse> {
    const items = await this.repository.listSummaries();
    return {
      items: items.map((item) => ({
        ...item,
        aclResourceStatus: this.getEntityAclResourceStatus(item.id)
      }))
    };
  }

  async getEntityConfig(entityId: string): Promise<EntityAdminConfigResponse> {
    this.resourceAccessService.assertEntityId(entityId, 'entityId');
    const entity = await this.repository.getEntityConfig(entityId);
    return {
      entity,
      aclResourceStatus: this.getEntityAclResourceStatus(entityId)
    };
  }

  async createEntityConfig(payload: UpsertEntityAdminConfigPayload): Promise<EntityAdminConfigResponse> {
    const normalizedEntity = this.normalizeEntityConfigForCreate(payload.entity);
    this.resourceAccessService.assertEntityId(normalizedEntity.id, 'entity.id');
    const entityId = await this.resolveUniqueEntityId(normalizedEntity.id);
    const entity: EntityConfig = entityId === normalizedEntity.id
      ? normalizedEntity
      : {
          ...normalizedEntity,
          id: entityId
        };

    await this.aclAdminConfigService.ensureEntityResource(entity.id);
    await this.visibilityAdminService.ensureEntityBootstrapPolicy({
      entityId: entity.id,
      objectApiName: entity.objectApiName
    });
    await this.repository.upsertEntityConfig(entity);
    await this.aclResourceSyncService.syncSystemResources();
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ENTITY_CONFIG_CREATE',
      targetType: 'entity-config',
      targetId: entity.id,
      objectApiName: entity.objectApiName,
      payload: entity,
      metadata: this.buildEntityAuditMetadata(entity)
    });

    return {
      entity: await this.repository.getEntityConfig(entity.id),
      aclResourceStatus: this.getEntityAclResourceStatus(entity.id)
    };
  }

  async previewEntityBootstrap(
    payload: UpsertEntityAdminConfigPayload
  ): Promise<EntityAdminBootstrapPreviewResponse> {
    const entity = this.normalizeBootstrapEntityBase(payload.entity);
    this.resourceAccessService.assertEntityId(entity.id, 'entity.id');

    const describedFields = (await this.salesforceService.describeObjectFields(
      entity.objectApiName
    )) as SalesforceFieldDescribe[];

    const preview = this.buildBootstrapPreview(entity, describedFields);
    return {
      entity: this.normalizeEntityConfig(undefined, preview.entity),
      warnings: preview.warnings
    };
  }

  async updateEntityConfig(entityId: string, payload: UpsertEntityAdminConfigPayload): Promise<EntityAdminConfigResponse> {
    this.resourceAccessService.assertEntityId(entityId, 'entityId');

    if (!(await this.repository.hasEntityConfig(entityId))) {
      throw new NotFoundException(`Entity config ${entityId} not found`);
    }

    const normalizedEntityConfig = this.normalizeEntityConfig(entityId, payload.entity);

    await this.aclAdminConfigService.ensureEntityResource(entityId);
    await this.repository.upsertEntityConfig(normalizedEntityConfig);
    await this.aclResourceSyncService.syncSystemResources();
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ENTITY_CONFIG_UPDATE',
      targetType: 'entity-config',
      targetId: entityId,
      objectApiName: normalizedEntityConfig.objectApiName,
      payload: normalizedEntityConfig,
      metadata: this.buildEntityAuditMetadata(normalizedEntityConfig)
    });
    const entity = await this.repository.getEntityConfig(entityId);

    return {
      entity,
      aclResourceStatus: this.getEntityAclResourceStatus(entityId)
    };
  }

  async deleteEntityConfig(entityId: string): Promise<void> {
    this.resourceAccessService.assertEntityId(entityId, 'entityId');

    if (!(await this.repository.hasEntityConfig(entityId))) {
      throw new NotFoundException(`Entity config ${entityId} not found`);
    }

    await this.repository.deleteEntityConfig(entityId);
    await this.aclResourceSyncService.syncSystemResources();
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ENTITY_CONFIG_DELETE',
      targetType: 'entity-config',
      targetId: entityId,
      metadata: {
        entityId
      }
    });
  }

  private getEntityAclResourceStatus(entityId: string): AclDerivedResourceStatus {
    return (
      this.aclService.getResourceStatus(`entity:${entityId}`) ?? {
        id: `entity:${entityId}`,
        accessMode: 'disabled',
        managedBy: 'system',
        syncState: 'stale'
      }
    );
  }

  async searchSalesforceObjectApiNames(
    query: string | undefined,
    limit: number | undefined
  ): Promise<{ items: SalesforceObjectSuggestion[] }> {
    const normalizedQuery = this.asOptionalString(query)?.toLowerCase() ?? '';
    const normalizedLimit = this.normalizeSuggestionLimit(limit);
    const items = await this.getCachedSalesforceObjectSuggestions();
    const filtered = normalizedQuery.length === 0 ? items : this.filterAndRankSalesforceObjects(items, normalizedQuery);

    return {
      items: filtered.slice(0, normalizedLimit)
    };
  }

  async searchSalesforceObjectFields(
    objectApiName: string,
    query: string | undefined,
    limit: number | undefined
  ): Promise<{ items: SalesforceFieldSuggestion[] }> {
    const normalizedObjectApiName = this.asOptionalString(objectApiName);
    if (!normalizedObjectApiName) {
      throw new BadRequestException('objectApiName is required');
    }

    const normalizedQuery = this.asOptionalString(query)?.toLowerCase() ?? '';
    const normalizedLimit = this.normalizeSuggestionLimit(limit);
    const items = await this.getCachedSalesforceFieldSuggestions(normalizedObjectApiName);
    const filtered = normalizedQuery.length === 0 ? items : this.filterAndRankSalesforceFields(items, normalizedQuery);

    return {
      items: filtered.slice(0, normalizedLimit)
    };
  }

  normalizeEntityConfigForPersistence(
    entityId: string | undefined,
    value: unknown
  ): EntityConfig {
    return this.normalizeEntityConfig(entityId, value);
  }

  private normalizeEntityConfig(entityId: string | undefined, value: unknown): EntityConfig {
    const entity = this.requireObject(value, 'entity payload must be an object');
    const id = this.requireString(entity.id, 'entity.id is required');

    if (entityId && id !== entityId) {
      throw new BadRequestException('entity.id must match route entityId');
    }

    const label = this.requireString(entity.label, 'entity.label is required');
    const objectApiName = this.requireString(entity.objectApiName, 'entity.objectApiName is required');

    return {
      id,
      label,
      objectApiName,
      description: this.asOptionalString(entity.description),
      navigation: this.normalizeNavigation(entity.navigation),
      list: this.normalizeListConfig(entity.list),
      detail: this.normalizeDetailConfig(entity.detail),
      form: this.normalizeFormConfig(entity.form)
    };
  }

  private normalizeEntityConfigForCreate(value: unknown): EntityConfig {
    const entity = this.requireObject(value, 'entity payload must be an object');
    const objectApiName = this.requireString(entity.objectApiName, 'entity.objectApiName is required');
    const derivedId = this.asOptionalString(entity.id) ?? objectApiName;
    const derivedLabel = this.asOptionalString(entity.label) ?? this.buildEntityLabelFromObjectApiName(objectApiName);

    if (!derivedLabel) {
      throw new BadRequestException('entity.label is required');
    }

    return this.normalizeEntityConfig(undefined, {
      ...entity,
      id: derivedId,
      label: derivedLabel,
      objectApiName
    });
  }

  private buildEntityLabelFromObjectApiName(objectApiName: string): string {
    const normalized = objectApiName
      .replace(/__(c|r)$/i, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim();

    return normalized.length > 0 ? normalized : objectApiName;
  }

  private async resolveUniqueEntityId(baseEntityId: string): Promise<string> {
    if (!(await this.repository.hasEntityConfig(baseEntityId))) {
      return baseEntityId;
    }

    for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
      const candidate = `${baseEntityId}-${suffix}`;
      if (!(await this.repository.hasEntityConfig(candidate))) {
        return candidate;
      }
    }

    throw new BadRequestException(`Unable to auto-generate a unique entity id from ${baseEntityId}`);
  }

  private buildEntityAuditMetadata(entity: EntityConfig): Record<string, unknown> {
    return {
      objectApiName: entity.objectApiName,
      hasList: Boolean(entity.list),
      hasDetail: Boolean(entity.detail),
      hasForm: Boolean(entity.form),
      listViews: entity.list?.views.length ?? 0,
      detailSections: entity.detail?.sections.length ?? 0,
      relatedLists: entity.detail?.relatedLists?.length ?? 0,
      formSections: entity.form?.sections.length ?? 0
    };
  }

  private normalizeBootstrapEntityBase(value: unknown): EntityConfig {
    const entity = this.requireObject(value, 'entity payload must be an object');
    if (entity.list !== undefined || entity.detail !== undefined || entity.form !== undefined) {
      throw new BadRequestException('bootstrap preview accepts base entity fields only');
    }

    return {
      id: this.requireString(entity.id, 'entity.id is required'),
      label: this.requireString(entity.label, 'entity.label is required'),
      objectApiName: this.requireString(entity.objectApiName, 'entity.objectApiName is required'),
      description: this.asOptionalString(entity.description),
      navigation: this.normalizeNavigation(entity.navigation)
    };
  }

  private buildBootstrapPreview(
    entity: EntityConfig,
    describedFields: SalesforceFieldDescribe[]
  ): EntityAdminBootstrapPreviewResponse {
    const normalizedFields = this.normalizeBootstrapFields(describedFields);
    const warnings: string[] = [
      `Al salvataggio viene auto-creata la risorsa ACL entity:${entity.id}; assegna manualmente i permessi ACL e i visibility assignments per abilitarne l uso.`
    ];
    const listPreset = this.buildBootstrapListPreset(entity, normalizedFields, warnings);
    const detailPreset = this.buildBootstrapDetailConfig(
      entity,
      normalizedFields,
      listPreset,
      warnings
    );
    const formPreset = this.buildBootstrapFormConfig(entity, normalizedFields, warnings);

    return {
      entity: {
        ...entity,
        list: listPreset.config,
        detail: detailPreset,
        form: formPreset
      },
      warnings
    };
  }

  private normalizeBootstrapFields(fields: SalesforceFieldDescribe[]): SalesforceFieldDescribe[] {
    return fields
      .map((field) => ({
        ...field,
        name: field.name.trim(),
        label: field.label.trim()
      }))
      .filter((field) => field.name.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));
  }

  private buildBootstrapListPreset(
    entity: EntityConfig,
    fields: SalesforceFieldDescribe[],
    warnings: string[]
  ): BootstrapListPreset {
    const displayFields = this.rankBootstrapFields(fields, 'list')
      .filter((field) => field.name !== 'Id')
      .slice(0, MAX_LIST_DISPLAY_FIELDS);
    const fallbackDisplayField = this.getFieldByName(fields, 'Id') ?? this.createSyntheticIdField();
    const resolvedDisplayFields =
      displayFields.length > 0 ? displayFields : fallbackDisplayField ? [fallbackDisplayField] : [];

    if (displayFields.length === 0) {
      warnings.push(
        'Preset list/detail: nessun campo business evidente, il bootstrap userà il solo Id come campo di fallback.'
      );
    }

    const searchFields = this.rankBootstrapFields(fields, 'search')
      .filter((field) => field.name !== 'Id')
      .slice(0, 3)
      .map((field) => field.name);
    if (searchFields.length === 0) {
      warnings.push(
        'Preset list: nessun campo testuale filterable disponibile per la ricerca iniziale.'
      );
    }

    const orderByField = this.selectBootstrapListOrderField(resolvedDisplayFields, fields);
    const queryFields = this.uniqueValues(['Id', ...resolvedDisplayFields.map((field) => field.name)]);
    const view: EntityListViewConfig = {
      id: 'all',
      label: 'Tutti',
      default: true,
      query: {
        object: entity.objectApiName,
        fields: queryFields,
        orderBy: orderByField
          ? [
              {
                field: orderByField.field,
                direction: orderByField.direction
              }
            ]
          : undefined
      },
      columns: resolvedDisplayFields.map((field) => this.toBootstrapColumn(field)),
      search:
        searchFields.length > 0
          ? {
              fields: searchFields,
              minLength: 2
            }
          : undefined,
      rowActions: [
        { type: 'link', label: 'Apri' },
        { type: 'edit', label: 'Modifica' },
        { type: 'delete', label: 'Elimina' }
      ]
    };

    return {
      config: {
        title: entity.label ?? entity.id,
        subtitle: entity.description,
        primaryAction: {
          type: 'link',
          label: 'Nuovo'
        },
        views: [view]
      },
      displayFieldNames: resolvedDisplayFields.map((field) => field.name)
    };
  }

  private buildBootstrapDetailConfig(
    entity: EntityConfig,
    fields: SalesforceFieldDescribe[],
    listPreset: BootstrapListPreset,
    warnings: string[]
  ): EntityDetailConfig {
    const extraFields = this.rankBootstrapFields(fields, 'detail')
      .filter((field) => !listPreset.displayFieldNames.includes(field.name) && field.name !== 'Id')
      .slice(0, MAX_DETAIL_EXTRA_FIELDS);
    const detailFields = this.uniqueFieldOrder(
      listPreset.displayFieldNames
        .map((fieldName) => this.getFieldByName(fields, fieldName))
        .concat(extraFields)
        .filter((field): field is SalesforceFieldDescribe => Boolean(field))
    );
    if (detailFields.length === 0) {
      detailFields.push(this.getFieldByName(fields, 'Id') ?? this.createSyntheticIdField());
    }
    const overviewFields = detailFields.slice(0, MAX_DETAIL_OVERVIEW_FIELDS);
    const remainingFields = detailFields.slice(MAX_DETAIL_OVERVIEW_FIELDS);
    const sections: EntityDetailSectionConfig[] = [];

    if (overviewFields.length > 0) {
      sections.push({
        title: 'Panoramica',
        fields: overviewFields.map((field) => this.toBootstrapDetailField(field))
      });
    }

    if (remainingFields.length > 0) {
      sections.push({
        title: 'Dettagli',
        fields: remainingFields.map((field) => this.toBootstrapDetailField(field))
      });
    } else {
      warnings.push(
        'Preset detail: sezione "Dettagli" omessa perché non ci sono altri campi ad alto valore.'
      );
    }

    const queryFields = this.uniqueValues([
      'Id',
      this.getFieldByName(fields, 'Name') ? 'Name' : '',
      ...detailFields.map((field) => field.name)
    ]);

    return {
      query: {
        object: entity.objectApiName,
        fields: queryFields,
        where: [
          {
            field: 'Id',
            operator: '=',
            value: '{{id}}'
          }
        ],
        limit: 1
      },
      sections,
      titleTemplate: '{{Name || Id}}',
      fallbackTitle: entity.label ?? entity.id,
      actions: [
        { type: 'edit', label: 'Modifica' },
        { type: 'delete', label: 'Elimina' }
      ]
    };
  }

  private buildBootstrapFormConfig(
    entity: EntityConfig,
    fields: SalesforceFieldDescribe[],
    warnings: string[]
  ): EntityFormConfig | undefined {
    const writableFields = this.rankBootstrapFields(fields, 'form')
      .filter((field) => (field.createable || field.updateable) && !this.isBootstrapManagedFormField(field))
      .slice(0, MAX_FORM_FIELDS);

    if (writableFields.length === 0) {
      warnings.push(
        'Preset form: nessun campo Salesforce createable/updateable disponibile, la sezione Form viene omessa.'
      );
      return undefined;
    }

    const sections = this.chunkFields(writableFields, MAX_FORM_SECTION_FIELDS).map(
      (chunk, index) => ({
        title: index === 0 ? 'Dati principali' : 'Altri campi',
        fields: chunk.map((field) => this.toBootstrapFormField(field))
      })
    );

    return {
      title: {
        create: `Nuovo ${entity.label ?? entity.id}`,
        edit: `Modifica ${entity.label ?? entity.id}`
      },
      query: {
        object: entity.objectApiName,
        fields: this.uniqueValues(['Id', ...writableFields.map((field) => field.name)]),
        where: [
          {
            field: 'Id',
            operator: '=',
            value: '{{id}}'
          }
        ],
        limit: 1
      },
      subtitle: entity.description,
      sections
    };
  }

  private rankBootstrapFields(
    fields: SalesforceFieldDescribe[],
    context: 'list' | 'detail' | 'form' | 'search'
  ): SalesforceFieldDescribe[] {
    const scored = fields
      .filter((field) => field.name.length > 0)
      .filter((field) => {
        if (context === 'search') {
          return field.filterable && TEXT_SEARCH_TYPES.has(field.type.toLowerCase());
        }

        return true;
      })
      .map((field) => ({
        field,
        score: this.computeBootstrapFieldScore(field, context)
      }))
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score;
        }

        return left.field.name.localeCompare(right.field.name, 'en', { sensitivity: 'base' });
      });

    return scored.map((entry) => entry.field);
  }

  private computeBootstrapFieldScore(
    field: SalesforceFieldDescribe,
    context: 'list' | 'detail' | 'form' | 'search'
  ): number {
    const name = field.name.toLowerCase();
    const label = field.label.toLowerCase();
    const type = field.type.toLowerCase();
    let score = 100;

    if (name === 'id') {
      score -= context === 'detail' ? 5 : 0;
    }

    if (name === 'name') {
      score -= 90;
    }

    if (
      name.endsWith('name') ||
      label.includes('name') ||
      name.includes('subject') ||
      name.includes('title')
    ) {
      score -= 55;
    }

    if (name.includes('status')) {
      score -= 50;
    }

    if (name.includes('stage')) {
      score -= 48;
    }

    if (name.includes('type')) {
      score -= 42;
    }

    if (name.includes('email')) {
      score -= 40;
    }

    if (name.includes('phone') || name.includes('mobile') || name.includes('fax')) {
      score -= 38;
    }

    if (name.includes('amount') || name.includes('total') || name.includes('value')) {
      score -= 30;
    }

    if (
      name.includes('date') ||
      name.includes('deadline') ||
      name.includes('start') ||
      name.includes('end') ||
      name.includes('close')
    ) {
      score -= 26;
    }

    if (type === 'date') {
      score -= context === 'detail' ? 18 : 12;
    } else if (type === 'datetime') {
      score -= context === 'detail' ? 14 : 8;
    } else if (type === 'email' || type === 'phone') {
      score -= 20;
    } else if (type === 'string' || type === 'picklist') {
      score -= 16;
    } else if (type === 'textarea' || type === 'longtextarea' || type === 'richtextarea') {
      score += context === 'list' ? 32 : 10;
    } else if (type === 'reference') {
      score += 24;
    } else if (type === 'boolean') {
      score += context === 'form' ? 8 : 18;
    }

    if (name !== 'id' && name.endsWith('id')) {
      score += 34;
    }

    if (this.isBootstrapSystemField(name)) {
      score += 70;
    } else if (this.isBootstrapAuditField(name)) {
      score += 30;
    }

    if (context === 'form') {
      if (field.createable || field.updateable) {
        score -= 12;
      }

      if (!field.nillable) {
        score -= 8;
      }
    }

    if (context === 'search' && type === 'reference') {
      score += 8;
    }

    return score;
  }

  private isBootstrapSystemField(name: string): boolean {
    return [
      'createdbyid',
      'lastmodifiedbyid',
      'systemmodstamp',
      'isdeleted',
      'ownerid',
      'recordtypeid',
      'lastreferenceddate',
      'lastvieweddate'
    ].includes(name);
  }

  private isBootstrapAuditField(name: string): boolean {
    return ['createddate', 'lastmodifieddate', 'lastactivitydate'].includes(name);
  }

  private selectBootstrapListOrderField(
    displayFields: SalesforceFieldDescribe[],
    allFields: SalesforceFieldDescribe[]
  ): { field: string; direction: 'ASC' | 'DESC' } | undefined {
    if (displayFields.some((field) => field.name === 'Name')) {
      return {
        field: 'Name',
        direction: 'ASC'
      };
    }

    if (this.getFieldByName(allFields, 'CreatedDate')) {
      return {
        field: 'CreatedDate',
        direction: 'DESC'
      };
    }

    if (this.getFieldByName(allFields, 'LastModifiedDate')) {
      return {
        field: 'LastModifiedDate',
        direction: 'DESC'
      };
    }

    const firstField = displayFields[0];
    if (!firstField || firstField.name === 'Id') {
      return undefined;
    }

    return {
      field: firstField.name,
      direction: 'ASC'
    };
  }

  private getFieldByName(
    fields: SalesforceFieldDescribe[],
    fieldName: string
  ): SalesforceFieldDescribe | undefined {
    return fields.find((field) => field.name === fieldName);
  }

  private createSyntheticIdField(): SalesforceFieldDescribe {
    return {
      name: 'Id',
      label: 'Record ID',
      type: 'id',
      nillable: false,
      createable: false,
      updateable: false,
      filterable: true
    };
  }

  private uniqueValues(values: string[]): string[] {
    return [...new Set(values.filter((value) => value.trim().length > 0))];
  }

  private uniqueFieldOrder(fields: SalesforceFieldDescribe[]): SalesforceFieldDescribe[] {
    const seen = new Set<string>();
    return fields.filter((field) => {
      if (seen.has(field.name)) {
        return false;
      }

      seen.add(field.name);
      return true;
    });
  }

  private toBootstrapColumn(field: SalesforceFieldDescribe): EntityListViewConfig['columns'][number] {
    return {
      field: field.name,
      label: field.label || field.name
    };
  }

  private toBootstrapDetailField(
    field: SalesforceFieldDescribe
  ): EntityDetailSectionConfig['fields'][number] {
    return {
      field: field.name,
      label: field.label || field.name,
      format: DETAIL_FORMAT_FIELD_TYPES.has(field.type.toLowerCase())
        ? (field.type.toLowerCase() as 'date' | 'datetime')
        : undefined
    };
  }

  private toBootstrapFormField(
    field: SalesforceFieldDescribe
  ): NonNullable<EntityFormSectionConfig['fields']>[number] {
    return {
      field: field.name
    };
  }

  private isBootstrapManagedFormField(field: SalesforceFieldDescribe): boolean {
    return (
      field.name === 'Id' ||
      this.isBootstrapSystemField(field.name.toLowerCase()) ||
      this.isBootstrapAuditField(field.name.toLowerCase()) ||
      field.calculated === true ||
      field.autoNumber === true
    );
  }

  private chunkFields<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }

  private normalizeNavigation(value: unknown): EntityConfig['navigation'] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const navigation = this.requireObject(value, 'entity.navigation must be an object');
    const basePath = this.asOptionalString(navigation.basePath);

    return basePath ? { basePath } : undefined;
  }

  private normalizeListConfig(value: unknown): EntityListConfig | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const list = this.requireObject(value, 'entity.list must be an object');
    const title = this.requireString(list.title, 'entity.list.title is required');
    const views = this.requireArray(list.views, 'entity.list.views must be an array')
      .map((entry, index) => this.normalizeListView(entry, index));

    if (views.length === 0) {
      throw new BadRequestException('entity.list.views must contain at least one item');
    }

    return {
      title,
      subtitle: this.asOptionalString(list.subtitle),
      primaryAction: this.normalizeAction(list.primaryAction),
      views
    };
  }

  private normalizeListView(value: unknown, index: number): EntityListViewConfig {
    const view = this.requireObject(value, `entity.list.views[${index}] must be an object`);
    const id = this.requireString(view.id, `entity.list.views[${index}].id is required`);
    const label = this.requireString(view.label, `entity.list.views[${index}].label is required`);
    const columns = this.normalizeColumns(view.columns, `entity.list.views[${index}].columns`);

    return {
      id,
      label,
      query: normalizeEntityQueryConfig(view.query, `entity.list.views[${index}].query`),
      columns,
      description: this.asOptionalString(view.description),
      default: this.asOptionalBoolean(view.default),
      pageSize: this.asOptionalNumber(view.pageSize),
      search: this.normalizeObjectOrUndefined(view.search, `entity.list.views[${index}].search`) as EntityListViewConfig['search'],
      primaryAction: this.normalizeAction(view.primaryAction),
      rowActions: this.normalizeActionsArray(view.rowActions, `entity.list.views[${index}].rowActions`)
    };
  }

  private normalizeDetailConfig(value: unknown): EntityDetailConfig | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const detail = this.requireObject(value, 'entity.detail must be an object');
    const sections = this.requireArray(detail.sections, 'entity.detail.sections must be an array')
      .map((entry, index) => this.normalizeDetailSection(entry, index));

    if (sections.length === 0) {
      throw new BadRequestException('entity.detail.sections must contain at least one item');
    }

    return {
      query: normalizeEntityQueryConfig(detail.query, 'entity.detail.query'),
      sections,
      relatedLists: this.normalizeRelatedListsArray(detail.relatedLists),
      titleTemplate: this.asOptionalString(detail.titleTemplate),
      fallbackTitle: this.asOptionalString(detail.fallbackTitle),
      subtitle: this.asOptionalString(detail.subtitle),
      actions: this.normalizeActionsArray(detail.actions, 'entity.detail.actions'),
      pathStatus: this.normalizeObjectOrUndefined(detail.pathStatus, 'entity.detail.pathStatus') as EntityDetailConfig['pathStatus']
    };
  }

  private normalizeDetailSection(value: unknown, index: number): EntityDetailSectionConfig {
    const section = this.requireObject(value, `entity.detail.sections[${index}] must be an object`);
    const title = this.requireString(section.title, `entity.detail.sections[${index}].title is required`);
    const fields = this.requireArray(section.fields, `entity.detail.sections[${index}].fields must be an array`)
      .map((entry, fieldIndex) =>
        this.requireObject(
          entry,
          `entity.detail.sections[${index}].fields[${fieldIndex}] must be an object`
        )
      );

    if (fields.length === 0) {
      throw new BadRequestException(`entity.detail.sections[${index}].fields must contain at least one item`);
    }

    return {
      title,
      fields: fields as unknown as EntityDetailSectionConfig['fields']
    };
  }

  private normalizeRelatedListsArray(value: unknown): EntityRelatedListConfig[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const rows = this.requireArray(value, 'entity.detail.relatedLists must be an array')
      .map((entry, index) => this.normalizeRelatedList(entry, index));

    return rows.length > 0 ? rows : undefined;
  }

  private normalizeRelatedList(value: unknown, index: number): EntityRelatedListConfig {
    const relatedList = this.requireObject(value, `entity.detail.relatedLists[${index}] must be an object`);
    const id = this.requireString(relatedList.id, `entity.detail.relatedLists[${index}].id is required`);
    const label = this.requireString(relatedList.label, `entity.detail.relatedLists[${index}].label is required`);
    const columns = this.normalizeColumns(relatedList.columns, `entity.detail.relatedLists[${index}].columns`);

    return {
      id,
      label,
      query: normalizeEntityQueryConfig(
        relatedList.query,
        `entity.detail.relatedLists[${index}].query`
      ),
      columns,
      description: this.asOptionalString(relatedList.description),
      actions: this.normalizeActionsArray(relatedList.actions, `entity.detail.relatedLists[${index}].actions`),
      rowActions: this.normalizeActionsArray(relatedList.rowActions, `entity.detail.relatedLists[${index}].rowActions`),
      emptyState: this.asOptionalString(relatedList.emptyState),
      pageSize: this.asOptionalNumber(relatedList.pageSize),
      entityId: this.asOptionalString(relatedList.entityId)
    };
  }

  private normalizeFormConfig(value: unknown): EntityFormConfig | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const form = this.requireObject(value, 'entity.form must be an object');
    const title = this.requireObject(form.title, 'entity.form.title is required');
    const createTitle = this.requireString(title.create, 'entity.form.title.create is required');
    const editTitle = this.requireString(title.edit, 'entity.form.title.edit is required');
    const sections = this.requireArray(form.sections, 'entity.form.sections must be an array')
      .map((entry, index) => this.normalizeFormSection(entry, index));

    if (sections.length === 0) {
      throw new BadRequestException('entity.form.sections must contain at least one item');
    }

    return {
      title: {
        create: createTitle,
        edit: editTitle
      },
      query: normalizeEntityQueryConfig(form.query, 'entity.form.query'),
      subtitle: this.asOptionalString(form.subtitle),
      sections
    };
  }

  private normalizeFormSection(value: unknown, index: number): EntityFormSectionConfig {
    const section = this.requireObject(value, `entity.form.sections[${index}] must be an object`);
    const fields = this.requireArray(section.fields, `entity.form.sections[${index}].fields must be an array`)
      .map((entry, fieldIndex) =>
        normalizeEntityFormFieldConfig(
          entry,
          `entity.form.sections[${index}].fields[${fieldIndex}]`
        )
      );

    if (fields.length === 0) {
      throw new BadRequestException(`entity.form.sections[${index}].fields must contain at least one item`);
    }

    return {
      title: this.asOptionalString(section.title),
      fields
    };
  }

  private normalizeColumns(value: unknown, path: string): EntityListViewConfig['columns'] {
    const columns = this.requireArray(value, `${path} must be an array`)
      .filter((entry): entry is string | Record<string, unknown> => typeof entry === 'string' || this.isObjectRecord(entry));

    if (columns.length === 0) {
      throw new BadRequestException(`${path} must contain at least one item`);
    }

    return columns as EntityListViewConfig['columns'];
  }

  private normalizeAction(value: unknown): EntityActionConfig | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const action = this.requireObject(value, 'action must be an object');
    return action as unknown as EntityActionConfig;
  }

  private normalizeActionsArray(value: unknown, path: string): EntityActionConfig[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const actions = this.requireArray(value, `${path} must be an array`)
      .map((entry, index) => this.requireObject(entry, `${path}[${index}] must be an object`))
      .map((entry) => entry as unknown as EntityActionConfig);

    return actions.length > 0 ? actions : undefined;
  }

  private normalizeObjectOrUndefined(value: unknown, errorMessage: string): Record<string, unknown> | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return this.requireObject(value, `${errorMessage} must be an object`);
  }

  private requireObject(value: unknown, errorMessage: string): Record<string, unknown> {
    if (!this.isObjectRecord(value)) {
      throw new BadRequestException(errorMessage);
    }

    return value;
  }

  private requireArray(value: unknown, errorMessage: string): unknown[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(errorMessage);
    }

    return value;
  }

  private requireString(value: unknown, errorMessage: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(errorMessage);
    }

    return value.trim();
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private asOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeSuggestionLimit(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 8;
    }

    return Math.min(25, Math.max(1, Math.trunc(value)));
  }

  private filterAndRankSalesforceObjects(
    items: SalesforceObjectSuggestion[],
    normalizedQuery: string
  ): SalesforceObjectSuggestion[] {
    type ScoredSuggestion = {
      item: SalesforceObjectSuggestion;
      score: number;
    };

    const scored = items
      .map((item) => ({
        item,
        score: this.computeSalesforceObjectScore(item, normalizedQuery)
      }))
      .filter((entry): entry is ScoredSuggestion => entry.score !== null)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score;
        }

        return left.item.name.localeCompare(right.item.name, 'en', { sensitivity: 'base' });
      });

    return scored.map((entry) => entry.item);
  }

  private computeSalesforceObjectScore(item: SalesforceObjectSuggestion, normalizedQuery: string): number | null {
    const name = item.name.toLowerCase();
    const label = item.label.toLowerCase();

    if (name.startsWith(normalizedQuery)) {
      return 0;
    }

    if (label.startsWith(normalizedQuery)) {
      return 1;
    }

    if (name.includes(normalizedQuery)) {
      return 2;
    }

    if (label.includes(normalizedQuery)) {
      return 3;
    }

    return null;
  }

  private filterAndRankSalesforceFields(
    items: SalesforceFieldSuggestion[],
    normalizedQuery: string
  ): SalesforceFieldSuggestion[] {
    type ScoredSuggestion = {
      item: SalesforceFieldSuggestion;
      score: number;
    };

    const scored = items
      .map((item) => ({
        item,
        score: this.computeSalesforceFieldScore(item, normalizedQuery)
      }))
      .filter((entry): entry is ScoredSuggestion => entry.score !== null)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score;
        }

        return left.item.name.localeCompare(right.item.name, 'en', { sensitivity: 'base' });
      });

    return scored.map((entry) => entry.item);
  }

  private computeSalesforceFieldScore(item: SalesforceFieldSuggestion, normalizedQuery: string): number | null {
    const name = item.name.toLowerCase();
    const label = item.label.toLowerCase();

    if (name.startsWith(normalizedQuery)) {
      return 0;
    }

    if (label.startsWith(normalizedQuery)) {
      return 1;
    }

    if (name.includes(normalizedQuery)) {
      return 2;
    }

    if (label.includes(normalizedQuery)) {
      return 3;
    }

    return null;
  }

  private async getCachedSalesforceObjectSuggestions(): Promise<SalesforceObjectSuggestion[]> {
    const nowMs = Date.now();
    const cache = this.salesforceObjectCache;
    if (cache && nowMs - cache.fetchedAtMs < this.salesforceObjectCacheTtlMs) {
      return cache.items;
    }

    const inFlight = this.salesforceObjectRefreshPromise;
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = this.refreshSalesforceObjectSuggestionCache();
    this.salesforceObjectRefreshPromise = refreshPromise;

    try {
      return await refreshPromise;
    } finally {
      this.salesforceObjectRefreshPromise = null;
    }
  }

  private async refreshSalesforceObjectSuggestionCache(): Promise<SalesforceObjectSuggestion[]> {
    const objects = await this.salesforceService.describeGlobalObjects();
    const items = objects
      .map((entry) => ({
        name: entry.name.trim(),
        label: entry.label.trim(),
        custom: Boolean(entry.custom)
      }))
      .filter((entry) => entry.name.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));

    this.salesforceObjectCache = {
      fetchedAtMs: Date.now(),
      items
    };

    return items;
  }

  private async getCachedSalesforceFieldSuggestions(objectApiName: string): Promise<SalesforceFieldSuggestion[]> {
    const cacheKey = objectApiName.toLowerCase();
    const nowMs = Date.now();
    const cache = this.salesforceFieldCache.get(cacheKey);

    if (cache && nowMs - cache.fetchedAtMs < this.salesforceFieldCacheTtlMs) {
      return cache.items;
    }

    const inFlight = this.salesforceFieldRefreshPromises.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = this.refreshSalesforceFieldSuggestionCache(objectApiName, cacheKey);
    this.salesforceFieldRefreshPromises.set(cacheKey, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      this.salesforceFieldRefreshPromises.delete(cacheKey);
    }
  }

  private async refreshSalesforceFieldSuggestionCache(
    objectApiName: string,
    cacheKey: string
  ): Promise<SalesforceFieldSuggestion[]> {
    const fields = await this.salesforceService.describeObjectFields(objectApiName);
    const items = fields
      .map((entry) => ({
        name: entry.name.trim(),
        label: entry.label.trim(),
        type: entry.type.trim(),
        filterable: Boolean(entry.filterable)
      }))
      .filter((entry) => entry.name.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));

    this.salesforceFieldCache.set(cacheKey, {
      fetchedAtMs: Date.now(),
      items
    });

    return items;
  }
}
