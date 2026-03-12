import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AclConfigRepository } from './acl-config.repository';
import { normalizeAclConfigSnapshot } from './acl-config.validation';
import type {
  AclPermissionDefinition,
  AclResourceDefinition,
  AclResourceStatus,
  AclResourceType
} from './acl.types';

@Injectable()
export class AclService implements OnModuleInit {
  private readonly logger = new Logger(AclService.name);

  private permissionsCatalog: AclPermissionDefinition[] = [];
  private defaultPermissions: string[] = [];
  private resources = new Map<string, AclResourceDefinition>();
  private aliasToCanonical = new Map<string, string>();

  constructor(private readonly aclConfigRepository: AclConfigRepository) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    const snapshot = normalizeAclConfigSnapshot(await this.aclConfigRepository.loadSnapshot());

    this.permissionsCatalog = snapshot.permissions;
    this.defaultPermissions = snapshot.defaultPermissions;
    this.aliasToCanonical = this.buildAliasMap(snapshot.permissions);
    this.resources.clear();

    for (const resource of snapshot.resources) {
      const normalizedPermissions = resource.permissions.map((permission) => this.toCanonicalPermission(permission));
      this.resources.set(resource.id, {
        ...resource,
        permissions: normalizedPermissions
      });
    }

    this.logger.log(
      `ACL loaded from PostgreSQL: ${this.resources.size} resources, ${this.permissionsCatalog.length} permission definitions.`
    );
  }

  getDefaultPermissions(): string[] {
    return this.defaultPermissions.map((permission) => this.toCanonicalPermission(permission));
  }

  normalizePermissions(permissions: string[]): string[] {
    return [...new Set(permissions.map((permission) => this.toCanonicalPermission(permission)))];
  }

  canAccess(userPermissions: string[], resourceId: string): boolean {
    const resource = this.resources.get(resourceId);

    if (!resource) {
      return false;
    }

    if (resource.syncState !== 'present' || resource.accessMode === 'disabled') {
      return false;
    }

    if (resource.accessMode === 'authenticated') {
      return true;
    }

    if (resource.permissions.length === 0) {
      return false;
    }

    const effectivePermissions = new Set<string>(
      this.normalizePermissions(userPermissions.length > 0 ? userPermissions : this.getDefaultPermissions())
    );

    return resource.permissions.some((permission) => effectivePermissions.has(permission));
  }

  hasResource(resourceId: string): boolean {
    return this.resources.has(resourceId);
  }

  getResource(resourceId: string): AclResourceDefinition | null {
    const resource = this.resources.get(resourceId);
    return resource ? { ...resource, permissions: [...resource.permissions] } : null;
  }

  getResourceStatus(resourceId: string): AclResourceStatus | null {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      return null;
    }

    return {
      id: resource.id,
      accessMode: resource.accessMode,
      managedBy: resource.managedBy,
      syncState: resource.syncState
    };
  }

  listResourcesByType(type: AclResourceType): AclResourceDefinition[] {
    return [...this.resources.values()].filter((resource) => resource.type === type);
  }

  private toCanonicalPermission(permission: string): string {
    const normalized = this.normalizePermission(permission);
    return this.aliasToCanonical.get(normalized) ?? normalized;
  }

  private buildAliasMap(catalog: AclPermissionDefinition[]): Map<string, string> {
    const map = new Map<string, string>();

    for (const permission of catalog) {
      const canonical = this.normalizePermission(permission.code);
      map.set(canonical, canonical);

      for (const alias of permission.aliases ?? []) {
        map.set(this.normalizePermission(alias), canonical);
      }
    }

    return map;
  }

  private normalizePermission(permission: string): string {
    return permission.trim().toUpperCase().replace(/[\s-]+/g, '_');
  }
}
