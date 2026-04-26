import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AclAdminConfigService } from '../../acl/acl-admin-config.service';
import type { AclDerivedResourceStatus } from '../../acl/acl-admin.types';
import { AclResourceSyncService } from '../../acl/acl-resource-sync.service';
import { AclService } from '../../acl/acl.service';
import { AuditWriteService } from '../../audit/audit-write.service';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import { SalesforceService } from '../../salesforce/salesforce.service';
import { VisibilityAdminService } from '../../visibility/visibility-admin.service';
import { EntityConfig } from '../entities.types';

import { EntityAdminConfigNormalizer } from './entity-admin-config.normalizer';
import { EntityAdminConfigRepository, EntityAdminConfigSummary } from './entity-admin-config.repository';
import {
  EntityAdminBootstrapPreviewResponse,
  SalesforceFieldDescribe,
  SalesforceFieldSuggestion,
  SalesforceObjectSuggestion
} from './entity-admin-config.types';
import { EntityBootstrapPreviewBuilder } from './entity-bootstrap-preview.builder';
import { EntitySalesforceSuggestionService } from './entity-salesforce-suggestion.service';

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

export type {
  EntityAdminBootstrapPreviewResponse,
  SalesforceFieldDescribe,
  SalesforceFieldSuggestion,
  SalesforceObjectSuggestion
};

@Injectable()
export class EntityAdminConfigRuntimeService {
  private readonly normalizer = new EntityAdminConfigNormalizer();
  private readonly bootstrapPreviewBuilder = new EntityBootstrapPreviewBuilder();
  private readonly salesforceSuggestionService: EntitySalesforceSuggestionService;

  constructor(
    private readonly aclAdminConfigService: AclAdminConfigService,
    private readonly aclService: AclService,
    private readonly visibilityAdminService: VisibilityAdminService,
    private readonly aclResourceSyncService: AclResourceSyncService,
    private readonly auditWriteService: AuditWriteService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly repository: EntityAdminConfigRepository,
    private readonly salesforceService: SalesforceService
  ) {
    this.salesforceSuggestionService = new EntitySalesforceSuggestionService(this.salesforceService);
  }

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
    const normalizedEntity = this.normalizer.normalizeForCreate(payload.entity);
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
    const entity = this.normalizer.normalizeBootstrapEntityBase(payload.entity);
    this.resourceAccessService.assertEntityId(entity.id, 'entity.id');

    const describedFields = (await this.salesforceService.describeObjectFields(
      entity.objectApiName
    )) as SalesforceFieldDescribe[];

    const preview = this.bootstrapPreviewBuilder.build(entity, describedFields);
    return {
      entity: this.normalizer.normalizeForPersistence(undefined, preview.entity),
      warnings: preview.warnings
    };
  }

  async updateEntityConfig(entityId: string, payload: UpsertEntityAdminConfigPayload): Promise<EntityAdminConfigResponse> {
    this.resourceAccessService.assertEntityId(entityId, 'entityId');

    if (!(await this.repository.hasEntityConfig(entityId))) {
      throw new NotFoundException(`Entity config ${entityId} not found`);
    }

    const normalizedEntityConfig = this.normalizer.normalizeForPersistence(entityId, payload.entity);

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

  async searchSalesforceObjectApiNames(
    query: string | undefined,
    limit: number | undefined
  ): Promise<{ items: SalesforceObjectSuggestion[] }> {
    return this.salesforceSuggestionService.searchObjectApiNames(query, limit);
  }

  async searchSalesforceObjectFields(
    objectApiName: string,
    query: string | undefined,
    limit: number | undefined
  ): Promise<{ items: SalesforceFieldSuggestion[] }> {
    return this.salesforceSuggestionService.searchObjectFields(objectApiName, query, limit);
  }

  normalizeEntityConfigForPersistence(
    entityId: string | undefined,
    value: unknown
  ): EntityConfig {
    return this.normalizer.normalizeForPersistence(entityId, value);
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
}
