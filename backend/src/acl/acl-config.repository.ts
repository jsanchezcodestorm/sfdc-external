import { Injectable } from '@nestjs/common';
import type {
  AclResourceAccessMode as PrismaAclResourceAccessMode,
  AclResourceKind,
  AclResourceManagedBy as PrismaAclResourceManagedBy,
  AclResourceSyncState as PrismaAclResourceSyncState,
  Prisma
} from '../prisma/generated/client';

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
      accessMode: this.mapAccessMode(resource.accessMode),
      managedBy: this.mapManagedBy(resource.managedBy),
      syncState: this.mapSyncState(resource.syncState),
      sourceType: resource.sourceType ? this.mapResourceType(resource.sourceType) : undefined,
      sourceRef: resource.sourceRef ?? undefined,
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

  private mapAccessMode(mode: PrismaAclResourceAccessMode): AclConfigSnapshot['resources'][number]['accessMode'] {
    switch (mode) {
      case 'DISABLED':
        return 'disabled';
      case 'AUTHENTICATED':
        return 'authenticated';
      case 'PERMISSION_BOUND':
        return 'permission-bound';
      default:
        return 'disabled';
    }
  }

  private mapManagedBy(managedBy: PrismaAclResourceManagedBy): AclConfigSnapshot['resources'][number]['managedBy'] {
    switch (managedBy) {
      case 'SYSTEM':
        return 'system';
      case 'MANUAL':
      default:
        return 'manual';
    }
  }

  private mapSyncState(syncState: PrismaAclResourceSyncState): AclConfigSnapshot['resources'][number]['syncState'] {
    switch (syncState) {
      case 'STALE':
        return 'stale';
      case 'PRESENT':
      default:
        return 'present';
    }
  }
}
