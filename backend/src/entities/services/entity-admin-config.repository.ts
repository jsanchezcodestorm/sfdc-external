import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/client';

import { PrismaService } from '../../prisma/prisma.service';
import { EntityConfig } from '../entities.types';

import { EntityConfigRepository } from './entity-config.repository';

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

export interface EntityAdminConfigSummary {
  id: string;
  label: string;
  objectApiName: string;
  hasList: boolean;
  hasDetail: boolean;
  hasForm: boolean;
  viewCount: number;
  detailSectionCount: number;
  relatedListCount: number;
  formSectionCount: number;
  updatedAt: string;
}

@Injectable()
export class EntityAdminConfigRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityConfigRepository: EntityConfigRepository
  ) {}

  async listSummaries(): Promise<EntityAdminConfigSummary[]> {
    const rows = await this.prisma.entityConfigRecord.findMany({
      orderBy: { id: 'asc' },
      include: {
        listConfig: {
          select: {
            updatedAt: true,
            views: {
              select: { id: true }
            }
          }
        },
        detailConfig: {
          select: {
            updatedAt: true,
            sections: {
              select: { id: true }
            },
            relatedLists: {
              select: { id: true }
            }
          }
        },
        formConfig: {
          select: {
            updatedAt: true,
            sections: {
              select: { id: true }
            }
          }
        }
      }
    });

    return rows.map((row) => {
      const latestUpdatedAt = [row.updatedAt, row.listConfig?.updatedAt, row.detailConfig?.updatedAt, row.formConfig?.updatedAt]
        .filter((value): value is Date => value instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        id: row.id,
        label: row.label,
        objectApiName: row.objectApiName,
        hasList: Boolean(row.listConfig),
        hasDetail: Boolean(row.detailConfig),
        hasForm: Boolean(row.formConfig),
        viewCount: row.listConfig?.views.length ?? 0,
        detailSectionCount: row.detailConfig?.sections.length ?? 0,
        relatedListCount: row.detailConfig?.relatedLists.length ?? 0,
        formSectionCount: row.formConfig?.sections.length ?? 0,
        updatedAt: (latestUpdatedAt ?? row.updatedAt).toISOString()
      };
    });
  }

  async getEntityConfig(entityId: string): Promise<EntityConfig> {
    return this.entityConfigRepository.getEntityConfig(entityId);
  }

  async hasEntityConfig(entityId: string): Promise<boolean> {
    const row = await this.prisma.entityConfigRecord.findUnique({
      where: { id: entityId },
      select: { id: true }
    });

    return Boolean(row);
  }

  async upsertEntityConfig(entityConfig: EntityConfig): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.entityConfigRecord.upsert({
        where: { id: entityConfig.id },
        create: {
          id: entityConfig.id,
          label: entityConfig.label ?? entityConfig.id,
          objectApiName: entityConfig.objectApiName,
          description: entityConfig.description ?? null,
          navigationJson: toNullableJson(entityConfig.navigation)
        },
        update: {
          label: entityConfig.label ?? entityConfig.id,
          objectApiName: entityConfig.objectApiName,
          description: entityConfig.description ?? null,
          navigationJson: toNullableJson(entityConfig.navigation)
        }
      });

      if (entityConfig.list) {
        await tx.entityListConfigRecord.upsert({
          where: { entityId: entityConfig.id },
          create: {
            entityId: entityConfig.id,
            title: entityConfig.list.title,
            subtitle: entityConfig.list.subtitle ?? null,
            primaryActionJson: toNullableJson(entityConfig.list.primaryAction)
          },
          update: {
            title: entityConfig.list.title,
            subtitle: entityConfig.list.subtitle ?? null,
            primaryActionJson: toNullableJson(entityConfig.list.primaryAction)
          }
        });

        await tx.entityListViewConfigRecord.deleteMany({
          where: { entityId: entityConfig.id }
        });

        for (const [index, view] of entityConfig.list.views.entries()) {
          await tx.entityListViewConfigRecord.create({
            data: {
              id: randomUUID(),
              entityId: entityConfig.id,
              sortOrder: index,
              viewId: view.id,
              label: view.label,
              description: view.description ?? null,
              isDefault: view.default ?? false,
              pageSize: typeof view.pageSize === 'number' ? view.pageSize : null,
              queryJson: toJson(view.query),
              columnsJson: toJson(view.columns),
              searchJson: toNullableJson(view.search),
              primaryActionJson: toNullableJson(view.primaryAction),
              rowActionsJson: toNullableJson(view.rowActions)
            }
          });
        }
      } else {
        await tx.entityListConfigRecord.deleteMany({
          where: { entityId: entityConfig.id }
        });
      }

      if (entityConfig.detail) {
        await tx.entityDetailConfigRecord.upsert({
          where: { entityId: entityConfig.id },
          create: {
            entityId: entityConfig.id,
            queryJson: toJson(entityConfig.detail.query),
            titleTemplate: entityConfig.detail.titleTemplate ?? null,
            fallbackTitle: entityConfig.detail.fallbackTitle ?? null,
            subtitle: entityConfig.detail.subtitle ?? null,
            actionsJson: toNullableJson(entityConfig.detail.actions),
            pathStatusJson: toNullableJson(entityConfig.detail.pathStatus)
          },
          update: {
            queryJson: toJson(entityConfig.detail.query),
            titleTemplate: entityConfig.detail.titleTemplate ?? null,
            fallbackTitle: entityConfig.detail.fallbackTitle ?? null,
            subtitle: entityConfig.detail.subtitle ?? null,
            actionsJson: toNullableJson(entityConfig.detail.actions),
            pathStatusJson: toNullableJson(entityConfig.detail.pathStatus)
          }
        });

        await tx.entityDetailSectionConfigRecord.deleteMany({
          where: { entityId: entityConfig.id }
        });
        await tx.entityRelatedListConfigRecord.deleteMany({
          where: { entityId: entityConfig.id }
        });

        for (const [index, section] of entityConfig.detail.sections.entries()) {
          await tx.entityDetailSectionConfigRecord.create({
            data: {
              id: randomUUID(),
              entityId: entityConfig.id,
              sortOrder: index,
              title: section.title,
              fieldsJson: toJson(section.fields)
            }
          });
        }

        for (const [index, relatedList] of (entityConfig.detail.relatedLists ?? []).entries()) {
          await tx.entityRelatedListConfigRecord.create({
            data: {
              id: randomUUID(),
              entityId: entityConfig.id,
              sortOrder: index,
              relatedListId: relatedList.id,
              label: relatedList.label,
              description: relatedList.description ?? null,
              queryJson: toJson(relatedList.query),
              columnsJson: toJson(relatedList.columns),
              actionsJson: toNullableJson(relatedList.actions),
              rowActionsJson: toNullableJson(relatedList.rowActions),
              emptyState: relatedList.emptyState ?? null,
              pageSize: typeof relatedList.pageSize === 'number' ? relatedList.pageSize : null,
              linkedEntityId: relatedList.entityId ?? null
            }
          });
        }
      } else {
        await tx.entityDetailConfigRecord.deleteMany({
          where: { entityId: entityConfig.id }
        });
      }

      if (entityConfig.form) {
        await tx.entityFormConfigRecord.upsert({
          where: { entityId: entityConfig.id },
          create: {
            entityId: entityConfig.id,
            createTitle: entityConfig.form.title.create,
            editTitle: entityConfig.form.title.edit,
            queryJson: toJson(entityConfig.form.query),
            subtitle: entityConfig.form.subtitle ?? null
          },
          update: {
            createTitle: entityConfig.form.title.create,
            editTitle: entityConfig.form.title.edit,
            queryJson: toJson(entityConfig.form.query),
            subtitle: entityConfig.form.subtitle ?? null
          }
        });

        await tx.entityFormSectionConfigRecord.deleteMany({
          where: { entityId: entityConfig.id }
        });

        for (const [index, section] of entityConfig.form.sections.entries()) {
          await tx.entityFormSectionConfigRecord.create({
            data: {
              id: randomUUID(),
              entityId: entityConfig.id,
              sortOrder: index,
              title: section.title ?? null,
              fieldsJson: toJson(section.fields ?? [])
            }
          });
        }
      } else {
        await tx.entityFormConfigRecord.deleteMany({
          where: { entityId: entityConfig.id }
        });
      }
    });

    this.entityConfigRepository.evictEntityConfig(entityConfig.id);
  }

  async deleteEntityConfig(entityId: string): Promise<void> {
    await this.prisma.entityConfigRecord.delete({
      where: { id: entityId }
    });

    this.entityConfigRepository.evictEntityConfig(entityId);
  }
}
