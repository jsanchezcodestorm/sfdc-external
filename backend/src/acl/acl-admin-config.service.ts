import { Injectable, NotFoundException } from '@nestjs/common';

import { AclAdminConfigRepository } from './acl-admin-config.repository';
import type {
  AclAdminDefaultPermissionsResponse,
  AclAdminPermissionListResponse,
  AclAdminPermissionResponse,
  AclAdminResourceListResponse,
  AclAdminResourceResponse
} from './acl-admin.types';
import { AclConfigRepository } from './acl-config.repository';
import {
  normalizeAclConfigSnapshot,
  normalizeAclPermissionDefinitionInput,
  normalizeAclResourceConfigInput,
  normalizeCanonicalPermissionCode
} from './acl-config.validation';
import { AclService } from './acl.service';
import type { AclConfigSnapshot, AclPermissionDefinition, AclResourceConfig } from './acl.types';

@Injectable()
export class AclAdminConfigService {
  constructor(
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly aclAdminConfigRepository: AclAdminConfigRepository,
    private readonly aclService: AclService
  ) {}

  async listPermissions(): Promise<AclAdminPermissionListResponse> {
    const snapshot = await this.loadSnapshot();
    return {
      items: snapshot.permissions.map((permission) => this.mapPermissionSummary(snapshot, permission))
    };
  }

  async getPermission(permissionCode: string): Promise<AclAdminPermissionResponse> {
    const normalizedCode = normalizeCanonicalPermissionCode(permissionCode, 'permissionCode');
    const snapshot = await this.loadSnapshot();
    const permission = snapshot.permissions.find((entry) => entry.code === normalizedCode);

    if (!permission) {
      throw new NotFoundException(`ACL permission ${normalizedCode} not found`);
    }

    return this.mapPermissionDetail(snapshot, permission);
  }

  async createPermission(payload: unknown): Promise<AclAdminPermissionResponse> {
    const snapshot = await this.loadSnapshot();
    const permission = normalizeAclPermissionDefinitionInput(payload, 'permission');
    const persisted = await this.persistSnapshot(upsertPermissionInSnapshot(snapshot, permission));
    const nextPermission = this.requirePermission(persisted, permission.code);
    return this.mapPermissionDetail(persisted, nextPermission);
  }

  async updatePermission(permissionCode: string, payload: unknown): Promise<AclAdminPermissionResponse> {
    const previousCode = normalizeCanonicalPermissionCode(permissionCode, 'permissionCode');
    const snapshot = await this.loadSnapshot();
    this.requirePermission(snapshot, previousCode);

    const permission = normalizeAclPermissionDefinitionInput(payload, 'permission');
    const persisted = await this.persistSnapshot(
      upsertPermissionInSnapshot(snapshot, permission, previousCode)
    );
    const nextPermission = this.requirePermission(persisted, permission.code);
    return this.mapPermissionDetail(persisted, nextPermission);
  }

  async deletePermission(permissionCode: string): Promise<void> {
    const normalizedCode = normalizeCanonicalPermissionCode(permissionCode, 'permissionCode');
    const snapshot = await this.loadSnapshot();
    this.requirePermission(snapshot, normalizedCode);
    await this.persistSnapshot(deletePermissionFromSnapshot(snapshot, normalizedCode));
  }

  async listResources(): Promise<AclAdminResourceListResponse> {
    const snapshot = await this.loadSnapshot();
    return {
      items: snapshot.resources.map((resource) => ({
        id: resource.id,
        type: resource.type,
        target: resource.target,
        description: resource.description,
        permissionCount: resource.permissions.length
      }))
    };
  }

  async getResource(resourceId: string): Promise<AclAdminResourceResponse> {
    const snapshot = await this.loadSnapshot();
    const resource = snapshot.resources.find((entry) => entry.id === resourceId.trim());

    if (!resource) {
      throw new NotFoundException(`ACL resource ${resourceId} not found`);
    }

    return {
      resource: {
        ...resource,
        permissions: [...resource.permissions]
      }
    };
  }

  async createResource(payload: unknown): Promise<AclAdminResourceResponse> {
    const snapshot = await this.loadSnapshot();
    const resource = normalizeAclResourceConfigInput(payload, 'resource');
    const persisted = await this.persistSnapshot(upsertResourceInSnapshot(snapshot, resource));
    const nextResource = this.requireResource(persisted, resource.id);
    return { resource: nextResource };
  }

  async updateResource(resourceId: string, payload: unknown): Promise<AclAdminResourceResponse> {
    const previousId = resourceId.trim();
    const snapshot = await this.loadSnapshot();
    this.requireResource(snapshot, previousId);

    const resource = normalizeAclResourceConfigInput(payload, 'resource');
    const persisted = await this.persistSnapshot(
      upsertResourceInSnapshot(snapshot, resource, previousId)
    );
    const nextResource = this.requireResource(persisted, resource.id);
    return { resource: nextResource };
  }

  async deleteResource(resourceId: string): Promise<void> {
    const normalizedId = resourceId.trim();
    const snapshot = await this.loadSnapshot();
    this.requireResource(snapshot, normalizedId);
    await this.persistSnapshot(deleteResourceFromSnapshot(snapshot, normalizedId));
  }

  async getDefaultPermissions(): Promise<AclAdminDefaultPermissionsResponse> {
    const snapshot = await this.loadSnapshot();
    return this.mapDefaultPermissions(snapshot);
  }

  async updateDefaultPermissions(permissionCodes: unknown[]): Promise<AclAdminDefaultPermissionsResponse> {
    const snapshot = await this.loadSnapshot();
    const nextSnapshot = normalizeAclConfigSnapshot({
      permissions: snapshot.permissions,
      defaultPermissions: permissionCodes,
      resources: snapshot.resources
    });
    const persisted = await this.persistSnapshot({
      ...snapshot,
      defaultPermissions: nextSnapshot.defaultPermissions
    });
    return this.mapDefaultPermissions(persisted);
  }

  private async loadSnapshot(): Promise<AclConfigSnapshot> {
    return this.aclConfigRepository.loadSnapshot();
  }

  private async persistSnapshot(snapshot: AclConfigSnapshot): Promise<AclConfigSnapshot> {
    const normalizedSnapshot = normalizeAclConfigSnapshot(snapshot);
    await this.aclAdminConfigRepository.replaceSnapshot(normalizedSnapshot);
    await this.aclService.reload();
    return this.aclConfigRepository.loadSnapshot();
  }

  private mapPermissionSummary(
    snapshot: AclConfigSnapshot,
    permission: AclPermissionDefinition
  ): AclAdminPermissionListResponse['items'][number] {
    return {
      code: permission.code,
      label: permission.label,
      description: permission.description,
      aliases: [...(permission.aliases ?? [])],
      isDefault: snapshot.defaultPermissions.includes(permission.code),
      resourceCount: snapshot.resources.filter((resource) => resource.permissions.includes(permission.code)).length
    };
  }

  private mapPermissionDetail(
    snapshot: AclConfigSnapshot,
    permission: AclPermissionDefinition
  ): AclAdminPermissionResponse {
    const resourceIds = snapshot.resources
      .filter((resource) => resource.permissions.includes(permission.code))
      .map((resource) => resource.id);

    return {
      permission: {
        ...permission,
        aliases: [...(permission.aliases ?? [])]
      },
      isDefault: snapshot.defaultPermissions.includes(permission.code),
      resourceIds,
      resourceCount: resourceIds.length
    };
  }

  private mapDefaultPermissions(snapshot: AclConfigSnapshot): AclAdminDefaultPermissionsResponse {
    const enabledCodes = new Set(snapshot.defaultPermissions);
    return {
      items: snapshot.permissions.map((permission) => ({
        permissionCode: permission.code,
        label: permission.label,
        description: permission.description,
        enabled: enabledCodes.has(permission.code)
      }))
    };
  }

  private requirePermission(snapshot: AclConfigSnapshot, permissionCode: string): AclPermissionDefinition {
    const permission = snapshot.permissions.find((entry) => entry.code === permissionCode);

    if (!permission) {
      throw new NotFoundException(`ACL permission ${permissionCode} not found`);
    }

    return permission;
  }

  private requireResource(snapshot: AclConfigSnapshot, resourceId: string): AclResourceConfig {
    const resource = snapshot.resources.find((entry) => entry.id === resourceId);

    if (!resource) {
      throw new NotFoundException(`ACL resource ${resourceId} not found`);
    }

    return {
      ...resource,
      permissions: [...resource.permissions]
    };
  }
}

function upsertPermissionInSnapshot(
  snapshot: AclConfigSnapshot,
  nextPermission: AclPermissionDefinition,
  previousCode?: string
): AclConfigSnapshot {
  const permissions = previousCode
    ? snapshot.permissions.map((permission) =>
        permission.code === previousCode ? nextPermission : permission
      )
    : [...snapshot.permissions, nextPermission];

  const nextCode = nextPermission.code;
  const defaultPermissions = orderDefaultPermissions(
    permissions,
    snapshot.defaultPermissions.map((code) =>
      previousCode && code === previousCode ? nextCode : code
    )
  );
  const resources = snapshot.resources.map((resource) => ({
    ...resource,
    permissions: resource.permissions.map((code) =>
      previousCode && code === previousCode ? nextCode : code
    )
  }));

  return {
    permissions,
    defaultPermissions,
    resources
  };
}

function deletePermissionFromSnapshot(
  snapshot: AclConfigSnapshot,
  permissionCode: string
): AclConfigSnapshot {
  return {
    permissions: snapshot.permissions.filter((permission) => permission.code !== permissionCode),
    defaultPermissions: snapshot.defaultPermissions.filter((code) => code !== permissionCode),
    resources: snapshot.resources.map((resource) => ({
      ...resource,
      permissions: resource.permissions.filter((code) => code !== permissionCode)
    }))
  };
}

function upsertResourceInSnapshot(
  snapshot: AclConfigSnapshot,
  nextResource: AclResourceConfig,
  previousId?: string
): AclConfigSnapshot {
  const resources = previousId
    ? snapshot.resources.map((resource) =>
        resource.id === previousId ? nextResource : resource
      )
    : [...snapshot.resources, nextResource];

  return {
    ...snapshot,
    resources
  };
}

function deleteResourceFromSnapshot(
  snapshot: AclConfigSnapshot,
  resourceId: string
): AclConfigSnapshot {
  return {
    ...snapshot,
    resources: snapshot.resources.filter((resource) => resource.id !== resourceId)
  };
}

function orderDefaultPermissions(
  permissions: AclPermissionDefinition[],
  defaultPermissions: string[]
): string[] {
  const enabledCodes = new Set(defaultPermissions);
  return permissions
    .map((permission) => permission.code)
    .filter((permissionCode) => enabledCodes.has(permissionCode));
}
