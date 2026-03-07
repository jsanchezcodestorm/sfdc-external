import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { AppAdminSummary, AppConfig, AvailableApp, AvailableAppEntity } from './apps.types';

type AppConfigWithEntities = Prisma.AppConfigRecordGetPayload<{
  include: {
    entities: {
      orderBy: {
        sortOrder: 'asc';
      };
    };
    permissions: {
      orderBy: {
        sortOrder: 'asc';
      };
    };
  };
}>;

type AvailableAppRecord = Prisma.AppConfigRecordGetPayload<{
  include: {
    entities: {
      orderBy: {
        sortOrder: 'asc';
      };
      include: {
        entity: {
          select: {
            id: true;
            label: true;
            description: true;
            objectApiName: true;
            navigationJson: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class AppsAdminConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listSummaries(): Promise<AppAdminSummary[]> {
    const rows = await this.prisma.appConfigRecord.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        _count: {
          select: {
            entities: true,
            permissions: true
          }
        }
      }
    });

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      description: row.description ?? undefined,
      sortOrder: row.sortOrder,
      entityCount: row._count.entities,
      permissionCount: row._count.permissions,
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async getApp(appId: string): Promise<AppConfig> {
    const row = await this.prisma.appConfigRecord.findUnique({
      where: { id: appId },
      include: {
        entities: {
          orderBy: { sortOrder: 'asc' }
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

      await tx.appEntityAssignmentRecord.deleteMany({
        where: { appId: app.id }
      });

      if (app.entityIds.length > 0) {
        await tx.appEntityAssignmentRecord.createMany({
          data: app.entityIds.map((entityId, index) => ({
            appId: app.id,
            entityId,
            sortOrder: index
          }))
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
        entities: {
          orderBy: { sortOrder: 'asc' },
          include: {
            entity: {
              select: {
                id: true,
                label: true,
                description: true,
                objectApiName: true,
                navigationJson: true
              }
            }
          }
        }
      }
    });

    return rows.map((row) => this.mapAvailableApp(row));
  }

  private mapAppConfig(row: AppConfigWithEntities): AppConfig {
    return {
      id: row.id,
      label: row.label,
      description: row.description ?? undefined,
      sortOrder: row.sortOrder,
      entityIds: row.entities.map((entity) => entity.entityId),
      permissionCodes: row.permissions.map((permission) => permission.permissionCode)
    };
  }

  private mapAvailableApp(row: AvailableAppRecord): AvailableApp {
    return {
      id: row.id,
      label: row.label,
      description: row.description ?? undefined,
      entities: row.entities.map((entityAssignment) => this.mapAvailableAppEntity(entityAssignment.entity))
    };
  }

  private mapAvailableAppEntity(entity: {
    id: string;
    label: string;
    description: string | null;
    objectApiName: string;
    navigationJson: Prisma.JsonValue | null;
  }): AvailableAppEntity {
    return {
      id: entity.id,
      label: entity.label,
      description: entity.description ?? undefined,
      basePath: this.readBasePath(entity.navigationJson),
      objectApiName: entity.objectApiName
    };
  }

  private readBasePath(value: Prisma.JsonValue | null): string | undefined {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return undefined;
    }

    const basePath = (value as Record<string, unknown>).basePath;
    return typeof basePath === 'string' && basePath.trim().length > 0 ? basePath.trim() : undefined;
  }
}
