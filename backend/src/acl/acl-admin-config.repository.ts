import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { AclResourceKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { AclConfigSnapshot, AclResourceType } from './acl.types';

@Injectable()
export class AclAdminConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceSnapshot(snapshot: AclConfigSnapshot): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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
