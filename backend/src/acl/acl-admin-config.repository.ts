import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { AclResourceKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { AclConfigSnapshot, AclResourceType } from './acl.types';

export interface ReplaceAclSnapshotOptions {
  renamedPermissionCodes?: Array<{
    previousCode: string;
    nextCode: string;
  }>;
  deletedPermissionCodes?: string[];
  replacedPermissionAppAssignments?: Array<{
    permissionCode: string;
    appIds: string[];
  }>;
}

@Injectable()
export class AclAdminConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceSnapshot(snapshot: AclConfigSnapshot, options?: ReplaceAclSnapshotOptions): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const rename of options?.renamedPermissionCodes ?? []) {
        if (rename.previousCode === rename.nextCode) {
          continue;
        }

        await tx.aclContactPermissionRecord.updateMany({
          where: {
            permissionCode: rename.previousCode,
          },
          data: {
            permissionCode: rename.nextCode,
          },
        });

        await tx.appPermissionAssignmentRecord.updateMany({
          where: {
            permissionCode: rename.previousCode,
          },
          data: {
            permissionCode: rename.nextCode,
          },
        });
      }

      const explicitCodesToDelete = [
        ...new Set([...(options?.deletedPermissionCodes ?? []), ...snapshot.defaultPermissions]),
      ];
      if (explicitCodesToDelete.length > 0) {
        await tx.aclContactPermissionRecord.deleteMany({
          where: {
            permissionCode: {
              in: explicitCodesToDelete,
            },
          },
        });
      }

      if ((options?.deletedPermissionCodes ?? []).length > 0) {
        await tx.appPermissionAssignmentRecord.deleteMany({
          where: {
            permissionCode: {
              in: [...new Set(options?.deletedPermissionCodes ?? [])],
            },
          },
        });
      }

      await tx.aclResourcePermissionRecord.deleteMany();
      await tx.aclDefaultPermissionRecord.deleteMany();
      await tx.aclPermissionAliasRecord.deleteMany();
      await tx.aclResourceRecord.deleteMany();
      await tx.aclPermissionRecord.deleteMany();

      for (const permission of snapshot.permissions) {
        await tx.aclPermissionRecord.create({
          data: {
            code: permission.code,
            label: permission.label ?? null,
            description: permission.description ?? null
          }
        });

        for (const [index, alias] of (permission.aliases ?? []).entries()) {
          await tx.aclPermissionAliasRecord.create({
            data: {
              id: randomUUID(),
              permissionCode: permission.code,
              alias,
              sortOrder: index
            }
          });
        }
      }

      for (const [index, permissionCode] of snapshot.defaultPermissions.entries()) {
        await tx.aclDefaultPermissionRecord.create({
          data: {
            permissionCode,
            sortOrder: index
          }
        });
      }

      for (const resource of snapshot.resources) {
        await tx.aclResourceRecord.create({
          data: {
            id: resource.id,
            type: this.mapResourceType(resource.type),
            target: resource.target ?? null,
            description: resource.description ?? null
          }
        });

        for (const [index, permissionCode] of resource.permissions.entries()) {
          await tx.aclResourcePermissionRecord.create({
            data: {
              id: randomUUID(),
              resourceId: resource.id,
              permissionCode,
              sortOrder: index
            }
          });
        }
      }

      for (const assignment of options?.replacedPermissionAppAssignments ?? []) {
        await tx.appPermissionAssignmentRecord.deleteMany({
          where: {
            permissionCode: assignment.permissionCode,
          },
        });

        if (assignment.appIds.length > 0) {
          await tx.appPermissionAssignmentRecord.createMany({
            data: assignment.appIds.map((appId, index) => ({
              appId,
              permissionCode: assignment.permissionCode,
              sortOrder: index,
            })),
          });
        }
      }
    });
  }

  async assertAppIdsExist(appIds: string[]): Promise<void> {
    if (appIds.length === 0) {
      return;
    }

    const rows = await this.prisma.appConfigRecord.findMany({
      where: {
        id: {
          in: appIds,
        },
      },
      select: {
        id: true,
      },
    });
    const foundIds = new Set(rows.map((row) => row.id));
    const missingIds = appIds.filter((appId) => !foundIds.has(appId));

    if (missingIds.length > 0) {
      throw new BadRequestException(`Unknown app ids: ${missingIds.join(', ')}`);
    }
  }

  async listPermissionAppAssignments(): Promise<Array<{ permissionCode: string; appId: string }>> {
    return this.prisma.appPermissionAssignmentRecord.findMany({
      orderBy: [{ permissionCode: 'asc' }, { sortOrder: 'asc' }],
      select: {
        permissionCode: true,
        appId: true,
      },
    });
  }

  private mapResourceType(type: AclResourceType): AclResourceKind {
    switch (type) {
      case 'rest':
        return AclResourceKind.REST;
      case 'entity':
        return AclResourceKind.ENTITY;
      case 'query':
        return AclResourceKind.QUERY;
      case 'route':
        return AclResourceKind.ROUTE;
    }
  }
}
