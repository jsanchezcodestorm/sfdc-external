import { Injectable } from '@nestjs/common';
import type { AclResourceKind, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { AclConfigSnapshot, AclResourceType } from './acl.types';

type PermissionRecordWithAliases = Prisma.AclPermissionRecordGetPayload<{
  include: {
    aliases: {
      orderBy: {
        sortOrder: 'asc';
      };
    };
  };
}>;

type ResourceRecordWithPermissions = Prisma.AclResourceRecordGetPayload<{
  include: {
    permissions: {
      orderBy: {
        sortOrder: 'asc';
      };
      include: {
        permission: {
          select: {
            code: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class AclConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadSnapshot(): Promise<AclConfigSnapshot> {
    const [permissions, defaults, resources] = await this.prisma.$transaction([
      this.prisma.aclPermissionRecord.findMany({
        orderBy: { code: 'asc' },
        include: {
          aliases: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      }),
      this.prisma.aclDefaultPermissionRecord.findMany({
        orderBy: { sortOrder: 'asc' }
      }),
      this.prisma.aclResourceRecord.findMany({
        orderBy: { id: 'asc' },
        include: {
          permissions: {
            orderBy: { sortOrder: 'asc' },
            include: {
              permission: {
                select: { code: true }
              }
            }
          }
        }
      })
    ]);

    return {
      permissions: permissions.map((permission) => this.mapPermission(permission)),
      defaultPermissions: defaults.map((entry) => entry.permissionCode),
      resources: resources.map((resource) => this.mapResource(resource))
    };
  }

  private mapPermission(permission: PermissionRecordWithAliases): AclConfigSnapshot['permissions'][number] {
    return {
      code: permission.code,
      label: permission.label ?? undefined,
      description: permission.description ?? undefined,
      aliases: permission.aliases.length > 0 ? permission.aliases.map((alias) => alias.alias) : undefined
    };
  }

  private mapResource(resource: ResourceRecordWithPermissions): AclConfigSnapshot['resources'][number] {
    return {
      id: resource.id,
      type: this.mapResourceType(resource.type),
      target: resource.target ?? undefined,
      description: resource.description ?? undefined,
      permissions: resource.permissions.map((entry) => entry.permission.code)
    };
  }

  private mapResourceType(kind: AclResourceKind): AclResourceType {
    switch (kind) {
      case 'REST':
        return 'rest';
      case 'ENTITY':
        return 'entity';
      case 'QUERY':
        return 'query';
      case 'ROUTE':
        return 'route';
      default:
        return 'rest';
    }
  }
}
