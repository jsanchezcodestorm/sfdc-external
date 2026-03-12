import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppItemKind, type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type {
  AppAdminSummary,
  AppConfig,
  AppCustomPageItemConfig,
  AppDashboardItemConfig,
  AppEntityItemConfig,
  AppExternalLinkItemConfig,
  AppHomeItemConfig,
  AppItemConfig,
  AppPageAction,
  AppPageBlock,
  AppPageConfig,
  AppReportItemConfig,
  AppUrlOpenMode,
  AvailableApp,
  AvailableAppCustomPageItem,
  AvailableAppDashboardItem,
  AvailableAppEntityItem,
  AvailableAppExternalLinkItem,
  AvailableAppHomeItem,
  AvailableAppItem,
  AvailableAppReportItem
} from './apps.types';

type AppConfigWithItems = Prisma.AppConfigRecordGetPayload<{
  include: {
    items: {
      orderBy: {
        sortOrder: 'asc';
      };
      include: {
        entity: {
          select: {
            objectApiName: true;
          };
        };
      };
    };
    permissions: {
      orderBy: {
        sortOrder: 'asc';
      };
    };
  };
}>;

type AppSummaryRecord = Prisma.AppConfigRecordGetPayload<{
  include: {
    _count: {
      select: {
        permissions: true;
      };
    };
    items: {
      select: {
        kind: true;
      };
    };
  };
}>;

type AvailableAppRecord = Prisma.AppConfigRecordGetPayload<{
  include: {
    items: {
      orderBy: {
        sortOrder: 'asc';
      };
      include: {
        entity: {
          select: {
            objectApiName: true;
          };
        };
      };
    };
  };
}>;

type ItemRow = AppConfigWithItems['items'][number];

type AvailableItemRow = AvailableAppRecord['items'][number];

@Injectable()
export class AppsAdminConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listSummaries(): Promise<AppAdminSummary[]> {
    const rows = await this.prisma.appConfigRecord.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        _count: {
          select: {
            permissions: true
          }
        },
        items: {
          select: {
            kind: true
          }
        }
      }
    });

    return rows.map((row) => this.mapSummary(row));
  }

  async getApp(appId: string): Promise<AppConfig> {
    const row = await this.prisma.appConfigRecord.findUnique({
      where: { id: appId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            entity: {
              select: {
                objectApiName: true
              }
            }
          }
        },
        permissions: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!row) {
      throw new NotFoundException(`App config ${appId} not found`);
    }

    return this.mapAppConfig(row);
  }

  async hasApp(appId: string): Promise<boolean> {
    const row = await this.prisma.appConfigRecord.findUnique({
      where: { id: appId },
      select: { id: true }
    });

    return Boolean(row);
  }

  async assertEntityIdsExist(entityIds: string[]): Promise<void> {
    if (entityIds.length === 0) {
      return;
    }

    const rows = await this.prisma.entityConfigRecord.findMany({
      where: {
        id: {
          in: entityIds
        }
      },
      select: {
        id: true
      }
    });
    const foundIds = new Set(rows.map((row) => row.id));
    const missingIds = entityIds.filter((entityId) => !foundIds.has(entityId));

    if (missingIds.length > 0) {
      throw new BadRequestException(`Unknown entity ids: ${missingIds.join(', ')}`);
    }
  }

  async assertPermissionCodesExist(permissionCodes: string[]): Promise<void> {
    if (permissionCodes.length === 0) {
      return;
    }

    const rows = await this.prisma.aclPermissionRecord.findMany({
      where: {
        code: {
          in: permissionCodes
        }
      },
      select: {
        code: true
      }
    });
    const foundCodes = new Set(rows.map((row) => row.code));
    const missingCodes = permissionCodes.filter((permissionCode) => !foundCodes.has(permissionCode));

    if (missingCodes.length > 0) {
      throw new BadRequestException(`Unknown permission codes: ${missingCodes.join(', ')}`);
    }
  }

  async assertResourceIdsExist(resourceIds: string[]): Promise<void> {
    if (resourceIds.length === 0) {
      return;
    }

    const rows = await this.prisma.aclResourceRecord.findMany({
      where: {
        id: {
          in: resourceIds
        }
      },
      select: {
        id: true
      }
    });
    const foundIds = new Set(rows.map((row) => row.id));
    const missingIds = resourceIds.filter((resourceId) => !foundIds.has(resourceId));

    if (missingIds.length > 0) {
      throw new BadRequestException(`Unknown resource ids: ${missingIds.join(', ')}`);
    }
  }

  async upsertApp(app: AppConfig): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.appConfigRecord.upsert({
        where: { id: app.id },
        create: {
          id: app.id,
          label: app.label,
          description: app.description ?? null,
          sortOrder: app.sortOrder
        },
        update: {
          label: app.label,
          description: app.description ?? null,
          sortOrder: app.sortOrder
        }
      });

      await tx.appItemRecord.deleteMany({
        where: { appId: app.id }
      });

      if (app.items.length > 0) {
        await tx.appItemRecord.createMany({
          data: app.items.map((item, index) => {
            const storedConfig = this.toStoredItemConfig(item);

            return {
              appId: app.id,
              itemId: item.id,
              kind: this.toPrismaAppItemKind(item.kind),
              label: item.label,
              description: item.description ?? null,
              sortOrder: index,
              entityId: item.kind === 'entity' ? item.entityId : null,
              resourceId: 'resourceId' in item ? item.resourceId ?? null : null,
              ...(storedConfig
                ? {
                    configJson: this.toNullableJson(storedConfig)
                  }
                : {})
            };
          })
        });
      }

      await tx.appPermissionAssignmentRecord.deleteMany({
        where: { appId: app.id }
      });

      if (app.permissionCodes.length > 0) {
        await tx.appPermissionAssignmentRecord.createMany({
          data: app.permissionCodes.map((permissionCode, index) => ({
            appId: app.id,
            permissionCode,
            sortOrder: index
          }))
        });
      }
    });
  }

  async deleteApp(appId: string): Promise<void> {
    await this.prisma.appConfigRecord.delete({
      where: { id: appId }
    });
  }

  async listAvailableApps(permissionCodes: string[]): Promise<AvailableApp[]> {
    if (permissionCodes.length === 0) {
      return [];
    }

    const rows = await this.prisma.appConfigRecord.findMany({
      where: {
        permissions: {
          some: {
            permissionCode: {
              in: permissionCodes
            }
          }
        }
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            entity: {
              select: {
                objectApiName: true
              }
            }
          }
        }
      }
    });

    return rows.map((row) => this.mapAvailableApp(row));
  }

  private mapSummary(row: AppSummaryRecord): AppAdminSummary {
    const entityCount = row.items.filter((item) => item.kind === AppItemKind.ENTITY).length;

    return {
      id: row.id,
      label: row.label,
      description: row.description ?? undefined,
      sortOrder: row.sortOrder,
      itemCount: row.items.length,
      entityCount,
      permissionCount: row._count.permissions,
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private mapAppConfig(row: AppConfigWithItems): AppConfig {
    return {
      id: row.id,
      label: row.label,
      description: row.description ?? undefined,
      sortOrder: row.sortOrder,
      items: row.items.map((item) => this.mapStoredItem(item)),
      permissionCodes: row.permissions.map((permission) => permission.permissionCode)
    };
  }

  private mapAvailableApp(row: AvailableAppRecord): AvailableApp {
    return {
      id: row.id,
      label: row.label,
      description: row.description ?? undefined,
      items: row.items.map((item) => this.mapAvailableItem(item))
    };
  }

  private mapStoredItem(row: ItemRow): AppItemConfig {
    switch (row.kind) {
      case AppItemKind.HOME:
        return this.mapStoredHomeItem(row);
      case AppItemKind.ENTITY:
        return this.mapStoredEntityItem(row);
      case AppItemKind.CUSTOM_PAGE:
        return this.mapStoredCustomPageItem(row);
      case AppItemKind.EXTERNAL_LINK:
        return this.mapStoredExternalLinkItem(row);
      case AppItemKind.REPORT:
        return this.mapStoredReportItem(row);
      case AppItemKind.DASHBOARD:
        return this.mapStoredDashboardItem(row);
    }
  }

  private mapStoredHomeItem(row: ItemRow): AppHomeItemConfig {
    return {
      id: row.itemId,
      kind: 'home',
      label: row.label,
      description: row.description ?? undefined,
      page: this.readPageConfig(row.configJson)
    };
  }

  private mapStoredEntityItem(row: ItemRow): AppEntityItemConfig {
    if (!row.entityId) {
      throw new BadRequestException(`App item ${row.appId}/${row.itemId} is invalid: entityId is required`);
    }

    return {
      id: row.itemId,
      kind: 'entity',
      label: row.label,
      description: row.description ?? undefined,
      entityId: row.entityId,
      resourceId: row.resourceId ?? undefined
    };
  }

  private mapStoredCustomPageItem(row: ItemRow): AppCustomPageItemConfig {
    return {
      id: row.itemId,
      kind: 'custom-page',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined,
      page: this.readPageConfig(row.configJson)
    };
  }

  private mapStoredExternalLinkItem(row: ItemRow): AppExternalLinkItemConfig {
    const config = this.readEmbedItemConfig(row.configJson, `${row.appId}/${row.itemId}`);

    return {
      id: row.itemId,
      kind: 'external-link',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined,
      url: config.url,
      openMode: config.openMode,
      iframeTitle: config.iframeTitle,
      height: config.height
    };
  }

  private mapStoredReportItem(row: ItemRow): AppReportItemConfig {
    return {
      id: row.itemId,
      kind: 'report',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined
    };
  }

  private mapStoredDashboardItem(row: ItemRow): AppDashboardItemConfig {
    return {
      id: row.itemId,
      kind: 'dashboard',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined
    };
  }

  private mapAvailableItem(row: AvailableItemRow): AvailableAppItem {
    switch (row.kind) {
      case AppItemKind.HOME:
        return this.mapAvailableHomeItem(row);
      case AppItemKind.ENTITY:
        return this.mapAvailableEntityItem(row);
      case AppItemKind.CUSTOM_PAGE:
        return this.mapAvailableCustomPageItem(row);
      case AppItemKind.EXTERNAL_LINK:
        return this.mapAvailableExternalLinkItem(row);
      case AppItemKind.REPORT:
        return this.mapAvailableReportItem(row);
      case AppItemKind.DASHBOARD:
        return this.mapAvailableDashboardItem(row);
    }
  }

  private mapAvailableHomeItem(row: AvailableItemRow): AvailableAppHomeItem {
    return {
      id: row.itemId,
      kind: 'home',
      label: row.label,
      description: row.description ?? undefined,
      page: this.readPageConfig(row.configJson)
    };
  }

  private mapAvailableEntityItem(row: AvailableItemRow): AvailableAppEntityItem {
    if (!row.entityId || !row.entity?.objectApiName) {
      throw new BadRequestException(
        `App item ${row.appId}/${row.itemId} is invalid: entity relation is required`,
      );
    }

    return {
      id: row.itemId,
      kind: 'entity',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined,
      entityId: row.entityId,
      objectApiName: row.entity.objectApiName
    };
  }

  private mapAvailableCustomPageItem(row: AvailableItemRow): AvailableAppCustomPageItem {
    return {
      id: row.itemId,
      kind: 'custom-page',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined,
      page: this.readPageConfig(row.configJson)
    };
  }

  private mapAvailableExternalLinkItem(row: AvailableItemRow): AvailableAppExternalLinkItem {
    const config = this.readEmbedItemConfig(row.configJson, `${row.appId}/${row.itemId}`);

    return {
      id: row.itemId,
      kind: 'external-link',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined,
      url: config.url,
      openMode: config.openMode,
      iframeTitle: config.iframeTitle,
      height: config.height
    };
  }

  private mapAvailableReportItem(row: AvailableItemRow): AvailableAppReportItem {
    return {
      id: row.itemId,
      kind: 'report',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined
    };
  }

  private mapAvailableDashboardItem(row: AvailableItemRow): AvailableAppDashboardItem {
    return {
      id: row.itemId,
      kind: 'dashboard',
      label: row.label,
      description: row.description ?? undefined,
      resourceId: row.resourceId ?? undefined
    };
  }

  private readPageConfig(value: Prisma.JsonValue | null): AppPageConfig {
    const pageObject = this.asObject(value);
    const blocks = this.asObjectArray(pageObject?.blocks);

    if (blocks.length === 0) {
      return { blocks: [] };
    }

    return {
      blocks: blocks.map((block, index) => this.readPageBlock(block, `page.blocks[${index}]`))
    };
  }

  private readPageBlock(value: Record<string, unknown>, path: string): AppPageBlock {
    const type = this.requireString(value.type, `${path}.type is required`);

    switch (type) {
      case 'hero':
        return {
          type: 'hero',
          title: this.requireString(value.title, `${path}.title is required`),
          body: this.asOptionalString(value.body),
          action: this.asObject(value.action)
            ? this.readPageAction(this.asObject(value.action) as Record<string, unknown>, `${path}.action`)
            : undefined
        };
      case 'markdown':
        return {
          type: 'markdown',
          markdown: this.requireString(value.markdown, `${path}.markdown is required`)
        };
      case 'link-list': {
        const links = this.asObjectArray(value.links).map((entry, index) =>
          this.readPageAction(entry, `${path}.links[${index}]`),
        );

        return {
          type: 'link-list',
          title: this.asOptionalString(value.title),
          links
        };
      }
      default:
        throw new BadRequestException(`${path}.type is invalid`);
    }
  }

  private readPageAction(value: Record<string, unknown>, path: string): AppPageAction {
    const targetType = this.requireString(value.targetType, `${path}.targetType is required`);

    if (targetType !== 'app-item' && targetType !== 'url') {
      throw new BadRequestException(`${path}.targetType is invalid`);
    }

    const rawOpenMode = this.asOptionalString(value.openMode);
    if (rawOpenMode && rawOpenMode !== 'same-tab' && rawOpenMode !== 'new-tab') {
      throw new BadRequestException(`${path}.openMode is invalid`);
    }
    const openMode = rawOpenMode as AppUrlOpenMode | undefined;

    return {
      label: this.requireString(value.label, `${path}.label is required`),
      targetType,
      target: this.requireString(value.target, `${path}.target is required`),
      openMode
    };
  }

  private readEmbedItemConfig(
    value: Prisma.JsonValue | null,
    path: string
  ): Pick<AppExternalLinkItemConfig, 'url' | 'openMode' | 'iframeTitle' | 'height'> {
    const config = this.asObject(value);
    if (!config) {
      throw new BadRequestException(`App item ${path} is invalid: config is required`);
    }

    const openMode = this.requireString(config.openMode, `App item ${path} is invalid: openMode is required`);
    if (openMode !== 'new-tab' && openMode !== 'iframe') {
      throw new BadRequestException(`App item ${path} is invalid: openMode is invalid`);
    }

    return {
      url: this.requireString(config.url, `App item ${path} is invalid: url is required`),
      openMode,
      iframeTitle: this.asOptionalString(config.iframeTitle),
      height: this.asOptionalNumber(config.height)
    };
  }

  private toStoredItemConfig(item: AppItemConfig): Prisma.JsonObject | null {
    switch (item.kind) {
      case 'home':
      case 'custom-page':
        return { blocks: item.page.blocks as unknown as Prisma.JsonArray };
      case 'external-link':
        return this.toEmbedItemConfig(item);
      case 'report':
      case 'dashboard':
        return null;
      case 'entity':
        return null;
    }
  }

  private toEmbedItemConfig(item: AppExternalLinkItemConfig): Prisma.JsonObject {
    return {
      url: item.url,
      openMode: item.openMode,
      iframeTitle: item.iframeTitle ?? null,
      height: item.height ?? null
    };
  }

  private toPrismaAppItemKind(kind: AppItemConfig['kind']): AppItemKind {
    switch (kind) {
      case 'home':
        return AppItemKind.HOME;
      case 'entity':
        return AppItemKind.ENTITY;
      case 'custom-page':
        return AppItemKind.CUSTOM_PAGE;
      case 'external-link':
        return AppItemKind.EXTERNAL_LINK;
      case 'report':
        return AppItemKind.REPORT;
      case 'dashboard':
        return AppItemKind.DASHBOARD;
    }
  }

  private toNullableJson(value: Prisma.JsonObject): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    return value;
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private asObjectArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is Record<string, unknown> => this.asObject(entry) !== null);
  }

  private requireString(value: unknown, message: string): string {
    const normalized = this.asOptionalString(value);
    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
