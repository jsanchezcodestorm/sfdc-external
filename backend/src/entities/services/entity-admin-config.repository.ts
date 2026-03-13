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
  layoutCount: number;
  detailLayoutCount: number;
  formLayoutCount: number;
  assignmentCount: number;
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
        layouts: {
          select: {
            updatedAt: true,
            assignments: {
              select: { id: true }
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
        }
      }
    });

    return rows.map((row) => {
      const timestamps = [row.updatedAt, row.listConfig?.updatedAt];
      const detailLayoutCount = row.layouts.filter((layout) => Boolean(layout.detailConfig)).length;
      const formLayoutCount = row.layouts.filter((layout) => Boolean(layout.formConfig)).length;
      const assignmentCount = row.layouts.reduce((total, layout) => total + layout.assignments.length, 0);
      const detailSectionCount = row.layouts.reduce(
        (total, layout) => total + (layout.detailConfig?.sections.length ?? 0),
        0
      );
      const relatedListCount = row.layouts.reduce(
        (total, layout) => total + (layout.detailConfig?.relatedLists.length ?? 0),
        0
      );
      const formSectionCount = row.layouts.reduce(
        (total, layout) => total + (layout.formConfig?.sections.length ?? 0),
        0
      );

      for (const layout of row.layouts) {
        timestamps.push(layout.updatedAt, layout.detailConfig?.updatedAt, layout.formConfig?.updatedAt);
      }

      const latestUpdatedAt = timestamps
        .filter((value): value is Date => value instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        id: row.id,
        label: row.label,
        objectApiName: row.objectApiName,
        hasList: Boolean(row.listConfig),
        hasDetail: detailLayoutCount > 0,
        hasForm: formLayoutCount > 0,
        layoutCount: row.layouts.length,
        detailLayoutCount,
        formLayoutCount,
        assignmentCount,
        viewCount: row.listConfig?.views.length ?? 0,
        detailSectionCount,
        relatedListCount,
        formSectionCount,
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

      await tx.entityLayoutConfigRecord.deleteMany({
        where: { entityId: entityConfig.id }
      });

      for (const [layoutIndex, layout] of entityConfig.layouts.entries()) {
        const layoutRow = await tx.entityLayoutConfigRecord.create({
          data: {
            id: randomUUID(),
            entityId: entityConfig.id,
            sortOrder: layoutIndex,
            layoutId: layout.id,
            label: layout.label,
            description: layout.description ?? null,
            isDefault: layout.isDefault ?? false
          }
        });

        for (const [assignmentIndex, assignment] of layout.assignments.entries()) {
          await tx.entityLayoutAssignmentRecord.create({
            data: {
              id: randomUUID(),
              layoutConfigId: layoutRow.id,
              sortOrder: assignmentIndex,
              recordTypeDeveloperName: assignment.recordTypeDeveloperName ?? null,
              permissionCode: assignment.permissionCode ?? null,
              priority: assignment.priority ?? 0
            }
          });
        }

        if (layout.detail) {
          const detailRow = await tx.entityDetailConfigRecord.create({
            data: {
              id: randomUUID(),
              layoutConfigId: layoutRow.id,
              queryJson: toJson(layout.detail.query),
              titleTemplate: layout.detail.titleTemplate ?? null,
              fallbackTitle: layout.detail.fallbackTitle ?? null,
              subtitle: layout.detail.subtitle ?? null,
              actionsJson: toNullableJson(layout.detail.actions),
              pathStatusJson: toNullableJson(layout.detail.pathStatus)
            }
          });

          for (const [index, section] of layout.detail.sections.entries()) {
            await tx.entityDetailSectionConfigRecord.create({
              data: {
                id: randomUUID(),
                detailConfigId: detailRow.id,
                sortOrder: index,
                title: section.title,
                fieldsJson: toJson(section.fields)
              }
            });
          }

          for (const [index, relatedList] of (layout.detail.relatedLists ?? []).entries()) {
            await tx.entityRelatedListConfigRecord.create({
              data: {
                id: randomUUID(),
                detailConfigId: detailRow.id,
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
        }

        if (layout.form) {
          const formRow = await tx.entityFormConfigRecord.create({
            data: {
              id: randomUUID(),
              layoutConfigId: layoutRow.id,
              createTitle: layout.form.title.create,
              editTitle: layout.form.title.edit,
              queryJson: toJson(layout.form.query),
              subtitle: layout.form.subtitle ?? null
            }
          });

          for (const [index, section] of layout.form.sections.entries()) {
            await tx.entityFormSectionConfigRecord.create({
              data: {
                id: randomUUID(),
                formConfigId: formRow.id,
                sortOrder: index,
                title: section.title ?? null,
                fieldsJson: toJson(section.fields ?? [])
              }
            });
          }
        }
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
