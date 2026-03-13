import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../prisma/generated/client';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  EntityConfig,
  EntityDetailConfig,
  EntityDetailSectionConfig,
  EntityFormConfig,
  EntityFormSectionConfig,
  EntityLayoutAssignmentConfig,
  EntityLayoutConfig,
  EntityListConfig,
  EntityListViewConfig,
  EntityRelatedListConfig
} from '../entities.types';
import { normalizeEntityFormFieldConfig } from '../entity-form-config.validation';
import { normalizeEntityQueryConfig } from '../entity-query-config.validation';

type EntityConfigRecordWithRelations = Prisma.EntityConfigRecordGetPayload<{
  include: {
    listConfig: {
      include: {
        views: {
          orderBy: {
            sortOrder: 'asc';
          };
        };
      };
    };
    layouts: {
      orderBy: {
        sortOrder: 'asc';
      };
      include: {
        assignments: {
          orderBy: {
            sortOrder: 'asc';
          };
        };
        detailConfig: {
          include: {
            sections: {
              orderBy: {
                sortOrder: 'asc';
              };
            };
            relatedLists: {
              orderBy: {
                sortOrder: 'asc';
              };
            };
          };
        };
        formConfig: {
          include: {
            sections: {
              orderBy: {
                sortOrder: 'asc';
              };
            };
          };
        };
      };
    };
  };
}>;

type EntityListConfigRecordWithRelations = NonNullable<EntityConfigRecordWithRelations['listConfig']>;
type EntityLayoutConfigRecordWithRelations = EntityConfigRecordWithRelations['layouts'][number];
type EntityDetailConfigRecordWithRelations = NonNullable<EntityLayoutConfigRecordWithRelations['detailConfig']>;
type EntityFormConfigRecordWithRelations = NonNullable<EntityLayoutConfigRecordWithRelations['formConfig']>;

@Injectable()
export class EntityConfigRepository {
  private readonly entityCache = new Map<string, EntityConfig>();
  private readonly inFlightLoads = new Map<string, Promise<EntityConfig>>();

  constructor(private readonly prisma: PrismaService) {}

  async getEntityConfig(entityId: string): Promise<EntityConfig> {
    const cached = this.entityCache.get(entityId);
    if (cached) {
      return cached;
    }

    const inFlight = this.inFlightLoads.get(entityId);
    if (inFlight) {
      return inFlight;
    }

    const loadPromise = this.loadEntityConfig(entityId).finally(() => {
      this.inFlightLoads.delete(entityId);
    });

    this.inFlightLoads.set(entityId, loadPromise);
    return loadPromise;
  }

  evictEntityConfig(entityId?: string): void {
    if (!entityId) {
      this.entityCache.clear();
      this.inFlightLoads.clear();
      return;
    }

    this.entityCache.delete(entityId);
    this.inFlightLoads.delete(entityId);
  }

  private async loadEntityConfig(entityId: string): Promise<EntityConfig> {
    const entityConfigRecord = await this.prisma.entityConfigRecord.findUnique({
      where: { id: entityId },
      include: {
        listConfig: {
          include: {
            views: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        layouts: {
          orderBy: { sortOrder: 'asc' },
          include: {
            assignments: {
              orderBy: { sortOrder: 'asc' }
            },
            detailConfig: {
              include: {
                sections: {
                  orderBy: { sortOrder: 'asc' }
                },
                relatedLists: {
                  orderBy: { sortOrder: 'asc' }
                }
              }
            },
            formConfig: {
              include: {
                sections: {
                  orderBy: { sortOrder: 'asc' }
                }
              }
            }
          }
        }
      }
    });

    if (!entityConfigRecord) {
      throw new NotFoundException(`Entity config not found for ${entityId}`);
    }

    const config = this.mapEntityConfig(entityConfigRecord);
    this.entityCache.set(entityId, config);
    return config;
  }

  private mapEntityConfig(entityConfigRecord: EntityConfigRecordWithRelations): EntityConfig {
    const id = this.requireString(entityConfigRecord.id, 'Entity config is invalid: id is required');
    const objectApiName = this.requireString(
      entityConfigRecord.objectApiName,
      `Entity config ${id} is invalid: objectApiName is required`
    );
    const label = this.requireString(entityConfigRecord.label, `Entity config ${id} is invalid: label is required`);
    const layouts = entityConfigRecord.layouts.map((layoutRecord) => this.mapLayoutConfig(id, layoutRecord));
    const defaultLayouts = layouts.filter((layout) => layout.isDefault);

    if (defaultLayouts.length > 1) {
      throw new BadRequestException(`Entity config ${id} is invalid: multiple default layouts are not allowed`);
    }

    return {
      id,
      objectApiName,
      label,
      description: this.asOptionalString(entityConfigRecord.description),
      navigation: this.asNavigation(entityConfigRecord.navigationJson),
      list: entityConfigRecord.listConfig ? this.mapListConfig(id, entityConfigRecord.listConfig) : undefined,
      layouts
    };
  }

  private mapLayoutConfig(entityId: string, layoutRecord: EntityLayoutConfigRecordWithRelations): EntityLayoutConfig {
    const id = this.requireString(
      layoutRecord.layoutId,
      `Entity layout config ${entityId} is invalid: layout.id is required`
    );
    const label = this.requireString(
      layoutRecord.label,
      `Entity layout config ${entityId}/${id} is invalid: layout.label is required`
    );
    const detail = layoutRecord.detailConfig ? this.mapDetailConfig(entityId, id, layoutRecord.detailConfig) : undefined;
    const form = layoutRecord.formConfig ? this.mapFormConfig(entityId, id, layoutRecord.formConfig) : undefined;

    if (!detail && !form) {
      throw new BadRequestException(
        `Entity layout config ${entityId}/${id} is invalid: at least one of detail or form is required`
      );
    }

    return {
      id,
      label,
      description: this.asOptionalString(layoutRecord.description),
      isDefault: layoutRecord.isDefault ? true : undefined,
      detail,
      form,
      assignments: layoutRecord.assignments.map((assignmentRecord, index) =>
        this.mapLayoutAssignmentConfig(entityId, id, assignmentRecord, index)
      )
    };
  }

  private mapLayoutAssignmentConfig(
    entityId: string,
    layoutId: string,
    assignmentRecord: EntityLayoutConfigRecordWithRelations['assignments'][number],
    index: number
  ): EntityLayoutAssignmentConfig {
    const recordTypeDeveloperName = this.asOptionalString(assignmentRecord.recordTypeDeveloperName);
    const permissionCode = this.asOptionalString(assignmentRecord.permissionCode);
    const priority = typeof assignmentRecord.priority === 'number' ? assignmentRecord.priority : 0;

    if (!recordTypeDeveloperName && !permissionCode) {
      throw new BadRequestException(
        `Entity layout config ${entityId}/${layoutId} is invalid: assignments[${index}] must declare recordTypeDeveloperName or permissionCode`
      );
    }

    return {
      recordTypeDeveloperName,
      permissionCode,
      priority
    };
  }

  private mapListConfig(entityId: string, listConfigRecord: EntityListConfigRecordWithRelations): EntityListConfig {
    const title = this.requireString(
      listConfigRecord.title,
      `Entity list config ${entityId} is invalid: title is required`
    );
    const views = listConfigRecord.views.map((viewConfigRecord) => this.mapListViewConfig(entityId, viewConfigRecord));

    if (views.length === 0) {
      throw new BadRequestException(`Entity list config ${entityId} is invalid: at least one view is required`);
    }

    return {
      title,
      subtitle: this.asOptionalString(listConfigRecord.subtitle),
      primaryAction: this.asTypedObject<EntityListConfig['primaryAction']>(listConfigRecord.primaryActionJson),
      views
    };
  }

  private mapListViewConfig(
    entityId: string,
    viewConfigRecord: EntityListConfigRecordWithRelations['views'][number]
  ): EntityListViewConfig {
    const id = this.requireString(
      viewConfigRecord.viewId,
      `Entity list view config ${entityId} is invalid: id is required`
    );
    const label = this.requireString(
      viewConfigRecord.label,
      `Entity list view config ${entityId}/${id} is invalid: label is required`
    );
    const columns = this.asStringOrObjectArray(viewConfigRecord.columnsJson);

    if (columns.length === 0) {
      throw new BadRequestException(`Entity list view config ${entityId}/${id} is invalid: columns are required`);
    }

    return {
      id,
      label,
      query: normalizeEntityQueryConfig(
        viewConfigRecord.queryJson,
        `Entity list view config ${entityId}/${id} is invalid: query`
      ),
      columns: columns as unknown as EntityListViewConfig['columns'],
      description: this.asOptionalString(viewConfigRecord.description),
      default: viewConfigRecord.isDefault ? true : undefined,
      pageSize: typeof viewConfigRecord.pageSize === 'number' ? viewConfigRecord.pageSize : undefined,
      search: this.asTypedObject<EntityListViewConfig['search']>(viewConfigRecord.searchJson),
      primaryAction: this.asTypedObject<EntityListViewConfig['primaryAction']>(viewConfigRecord.primaryActionJson),
      rowActions: this.asTypedObjectArray<NonNullable<EntityListViewConfig['rowActions']>[number]>(
        viewConfigRecord.rowActionsJson
      )
    };
  }

  private mapDetailConfig(
    entityId: string,
    layoutId: string,
    detailConfigRecord: EntityDetailConfigRecordWithRelations
  ): EntityDetailConfig {
    const sections = detailConfigRecord.sections.map((sectionConfigRecord) =>
      this.mapDetailSectionConfig(entityId, layoutId, sectionConfigRecord)
    );

    if (sections.length === 0) {
      throw new BadRequestException(`Entity detail config ${entityId}/${layoutId} is invalid: sections are required`);
    }

    const relatedLists = detailConfigRecord.relatedLists.map((relatedListConfigRecord) =>
      this.mapRelatedListConfig(entityId, layoutId, relatedListConfigRecord)
    );

    return {
      query: normalizeEntityQueryConfig(
        detailConfigRecord.queryJson,
        `Entity detail config ${entityId}/${layoutId} is invalid: query`
      ),
      sections,
      relatedLists: relatedLists.length > 0 ? relatedLists : undefined,
      titleTemplate: this.asOptionalString(detailConfigRecord.titleTemplate),
      fallbackTitle: this.asOptionalString(detailConfigRecord.fallbackTitle),
      subtitle: this.asOptionalString(detailConfigRecord.subtitle),
      actions: this.asTypedObjectArray<NonNullable<EntityDetailConfig['actions']>[number]>(
        detailConfigRecord.actionsJson
      ),
      pathStatus: this.asTypedObject<EntityDetailConfig['pathStatus']>(detailConfigRecord.pathStatusJson)
    };
  }

  private mapDetailSectionConfig(
    entityId: string,
    layoutId: string,
    sectionConfigRecord: EntityDetailConfigRecordWithRelations['sections'][number]
  ): EntityDetailSectionConfig {
    const title = this.requireString(
      sectionConfigRecord.title,
      `Entity detail section config ${entityId}/${layoutId} is invalid: title is required`
    );
    const fields = this.asObjectArray(sectionConfigRecord.fieldsJson);

    if (fields.length === 0) {
      throw new BadRequestException(
        `Entity detail section config ${entityId}/${layoutId}/${title} is invalid: fields are required`
      );
    }

    return {
      title,
      fields: fields as unknown as EntityDetailSectionConfig['fields']
    };
  }

  private mapRelatedListConfig(
    entityId: string,
    layoutId: string,
    relatedListConfigRecord: EntityDetailConfigRecordWithRelations['relatedLists'][number]
  ): EntityRelatedListConfig {
    const id = this.requireString(
      relatedListConfigRecord.relatedListId,
      `Entity related-list config ${entityId}/${layoutId} is invalid: id is required`
    );
    const label = this.requireString(
      relatedListConfigRecord.label,
      `Entity related-list config ${entityId}/${layoutId}/${id} is invalid: label is required`
    );
    const columns = this.asStringOrObjectArray(relatedListConfigRecord.columnsJson);

    if (columns.length === 0) {
      throw new BadRequestException(
        `Entity related-list config ${entityId}/${layoutId}/${id} is invalid: columns are required`
      );
    }

    return {
      id,
      label,
      query: normalizeEntityQueryConfig(
        relatedListConfigRecord.queryJson,
        `Entity related-list config ${entityId}/${layoutId}/${id} is invalid: query`
      ),
      columns: columns as unknown as EntityRelatedListConfig['columns'],
      description: this.asOptionalString(relatedListConfigRecord.description),
      actions: this.asTypedObjectArray<NonNullable<EntityRelatedListConfig['actions']>[number]>(
        relatedListConfigRecord.actionsJson
      ),
      rowActions: this.asTypedObjectArray<NonNullable<EntityRelatedListConfig['rowActions']>[number]>(
        relatedListConfigRecord.rowActionsJson
      ),
      emptyState: this.asOptionalString(relatedListConfigRecord.emptyState),
      pageSize: typeof relatedListConfigRecord.pageSize === 'number' ? relatedListConfigRecord.pageSize : undefined,
      entityId: this.asOptionalString(relatedListConfigRecord.linkedEntityId)
    };
  }

  private mapFormConfig(entityId: string, layoutId: string, formConfigRecord: EntityFormConfigRecordWithRelations): EntityFormConfig {
    const createTitle = this.requireString(
      formConfigRecord.createTitle,
      `Entity form config ${entityId}/${layoutId} is invalid: title.create is required`
    );
    const editTitle = this.requireString(
      formConfigRecord.editTitle,
      `Entity form config ${entityId}/${layoutId} is invalid: title.edit is required`
    );
    const sections = formConfigRecord.sections.map((sectionConfigRecord) =>
      this.mapFormSectionConfig(entityId, layoutId, sectionConfigRecord)
    );

    if (sections.length === 0) {
      throw new BadRequestException(`Entity form config ${entityId}/${layoutId} is invalid: sections are required`);
    }

    return {
      title: {
        create: createTitle,
        edit: editTitle
      },
      query: normalizeEntityQueryConfig(
        formConfigRecord.queryJson,
        `Entity form config ${entityId}/${layoutId} is invalid: query`
      ),
      subtitle: this.asOptionalString(formConfigRecord.subtitle),
      sections
    };
  }

  private mapFormSectionConfig(
    entityId: string,
    layoutId: string,
    sectionConfigRecord: EntityFormConfigRecordWithRelations['sections'][number]
  ): EntityFormSectionConfig {
    const fields = this.asObjectArray(sectionConfigRecord.fieldsJson).map((field, index) =>
      normalizeEntityFormFieldConfig(field, `Entity form section config ${entityId}/${layoutId}.fields[${index}]`)
    );

    if (fields.length === 0) {
      throw new BadRequestException(`Entity form section config ${entityId}/${layoutId} is invalid: fields are required`);
    }

    return {
      title: this.asOptionalString(sectionConfigRecord.title),
      fields
    };
  }

  private asNavigation(value: Prisma.JsonValue | null): EntityConfig['navigation'] | undefined {
    const navigationObject = this.asObject(value);
    if (!navigationObject) {
      return undefined;
    }

    const basePath = this.asOptionalString(navigationObject.basePath);
    if (!basePath) {
      return undefined;
    }

    return { basePath };
  }

  private requireString(value: unknown, errorMessage: string): string {
    const normalized = this.asNonEmptyString(value);
    if (!normalized) {
      throw new BadRequestException(errorMessage);
    }

    return normalized;
  }

  private asTypedObject<T>(value: unknown): T | undefined {
    const objectValue = this.asObject(value);
    return objectValue ? (objectValue as T) : undefined;
  }

  private asTypedObjectArray<T>(value: unknown): T[] | undefined {
    const objectArray = this.asObjectArray(value);
    return objectArray.length > 0 ? (objectArray as T[]) : undefined;
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return this.isObjectRecord(value) ? value : null;
  }

  private asObjectArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is Record<string, unknown> => this.isObjectRecord(entry));
  }

  private asStringOrObjectArray(value: unknown): Array<string | Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is string | Record<string, unknown> => typeof entry === 'string' || this.isObjectRecord(entry)
    );
  }

  private asOptionalString(value: unknown): string | undefined {
    const normalized = this.asNonEmptyString(value);
    return normalized || undefined;
  }

  private asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
