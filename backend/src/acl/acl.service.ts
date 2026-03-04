import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  AclResourceDefinition,
  AclResourceType,
  DefaultPermissionsFile,
  PermissionCatalogFile,
  PermissionDefinition
} from './acl.types';

@Injectable()
export class AclService implements OnModuleInit {
  private readonly logger = new Logger(AclService.name);

  private permissionsCatalog: PermissionDefinition[] = [];
  private defaultPermissions: string[] = [];
  private resources = new Map<string, AclResourceDefinition>();
  private aliasToCanonical = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.reload();
  }

  reload(): void {
    this.permissionsCatalog = this.loadJson<PermissionCatalogFile>('permissions.json', { permissions: [] }).permissions;
    this.defaultPermissions = this.loadJson<DefaultPermissionsFile>('defaults.json', { permissions: ['PORTAL_USER'] }).permissions;

    this.aliasToCanonical = this.buildAliasMap(this.permissionsCatalog);
    this.resources.clear();

    const resourceFiles: Array<{ fileName: string; type: AclResourceType }> = [
      { fileName: 'resources/rest.json', type: 'rest' },
      { fileName: 'resources/entity.json', type: 'entity' },
      { fileName: 'resources/query.json', type: 'query' },
      { fileName: 'resources/route.json', type: 'route' }
    ];

    for (const resourceFile of resourceFiles) {
      const entries = this.loadJson<AclResourceDefinition[]>(resourceFile.fileName, []);

      for (const entry of entries) {
        const normalizedPermissions = entry.permissions.map((permission) => this.toCanonicalPermission(permission));
        this.resources.set(entry.id, {
          ...entry,
          type: resourceFile.type,
          permissions: normalizedPermissions
        });
      }
    }

    this.logger.log(`ACL loaded: ${this.resources.size} resources, ${this.permissionsCatalog.length} permission definitions.`);
  }

  getDefaultPermissions(): string[] {
    return this.defaultPermissions.map((permission) => this.toCanonicalPermission(permission));
  }

  canAccess(userPermissions: string[], resourceId: string): boolean {
    const resource = this.resources.get(resourceId);

    if (!resource) {
      return false;
    }

    if (resource.permissions.length === 0) {
      return true;
    }

    const effectivePermissions = new Set<string>(
      (userPermissions.length > 0 ? userPermissions : this.getDefaultPermissions()).map((permission) =>
        this.toCanonicalPermission(permission)
      )
    );

    return resource.permissions.some((permission) => effectivePermissions.has(permission));
  }

  listResourcesByType(type: AclResourceType): AclResourceDefinition[] {
    return [...this.resources.values()].filter((resource) => resource.type === type);
  }

  private toCanonicalPermission(permission: string): string {
    const normalized = this.normalizePermission(permission);
    return this.aliasToCanonical.get(normalized) ?? normalized;
  }

  private buildAliasMap(catalog: PermissionDefinition[]): Map<string, string> {
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

  private loadJson<T>(relativePath: string, fallback: T): T {
    const candidatePaths = this.resolveAclConfigCandidates(relativePath);

    for (const candidatePath of candidatePaths) {
      if (!existsSync(candidatePath)) {
        continue;
      }

      const raw = readFileSync(candidatePath, 'utf8');
      return JSON.parse(raw) as T;
    }

    this.logger.warn(`ACL config missing for ${relativePath}, using fallback.`);
    return fallback;
  }

  private resolveAclConfigCandidates(relativePath: string): string[] {
    const configuredPath = this.configService.get<string>('ACL_CONFIG_PATH');
    const candidates = [
      configuredPath ? path.resolve(configuredPath, relativePath) : '',
      path.resolve(process.cwd(), 'config/acl', relativePath),
      path.resolve(process.cwd(), 'backend/config/acl', relativePath)
    ];

    return candidates.filter((candidate) => candidate.length > 0);
  }
}
