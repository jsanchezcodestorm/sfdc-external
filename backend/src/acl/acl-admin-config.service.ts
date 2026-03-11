import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditWriteService } from '../audit/audit-write.service';

import { AclAdminConfigRepository, type ReplaceAclSnapshotOptions } from './acl-admin-config.repository';
import type {
  AclAdminDefaultPermissionsResponse,
  AclAdminPermissionListResponse,
  AclAdminPermissionResponse,
  AclAdminResourceSummary,
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
    private readonly aclService: AclService,
    private readonly auditWriteService: AuditWriteService
  ) {}

  async listPermissions(): Promise<AclAdminPermissionListResponse> {
    const [snapshot, permissionAppIds] = await Promise.all([
      this.loadSnapshot(),
      this.loadPermissionAppIds()
    ]);
    return {
      items: snapshot.permissions.map((permission) =>
        this.mapPermissionSummary(snapshot, permission, permissionAppIds)
      )
    };
  }

  async getPermission(permissionCode: string): Promise<AclAdminPermissionResponse> {
    const normalizedCode = normalizeCanonicalPermissionCode(permissionCode, 'permissionCode');
    const [snapshot, permissionAppIds] = await Promise.all([
      this.loadSnapshot(),
      this.loadPermissionAppIds()
    ]);
    const permission = snapshot.permissions.find((entry) => entry.code === normalizedCode);

    if (!permission) {
      throw new NotFoundException(`ACL permission ${normalizedCode} not found`);
    }

    return this.mapPermissionDetail(snapshot, permission, permissionAppIds);
  }

  async createPermission(
    payload: unknown,
    appIdsPayload: unknown,
    resourceIdsPayload: unknown
  ): Promise<AclAdminPermissionResponse> {
    const snapshot = await this.loadSnapshot();
    const permission = normalizeAclPermissionDefinitionInput(payload, 'permission');
    const appIds = await this.normalizeAppIds(appIdsPayload);
    const resourceIds = this.normalizeResourceIds(snapshot, resourceIdsPayload);
    const persisted = await this.persistSnapshot(
      upsertPermissionInSnapshot(snapshot, permission, resourceIds),
      {
        replacedPermissionAppAssignments: [
          {
            permissionCode: permission.code,
            appIds
          }
        ]
      }
    );
    const nextPermission = this.requirePermission(persisted, permission.code);
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_PERMISSION_CREATE',
      targetType: 'acl-permission',
      targetId: permission.code,
      payload: {
        permission,
        appIds,
        resourceIds
      },
      metadata: {
        aliasesCount: nextPermission.aliases?.length ?? 0,
        appCount: appIds.length,
        resourceCount: resourceIds.length
      }
    });
    return this.mapPermissionDetail(persisted, nextPermission, new Map([[permission.code, appIds]]));
  }

  async updatePermission(
    permissionCode: string,
    payload: unknown,
    appIdsPayload: unknown,
    resourceIdsPayload: unknown
  ): Promise<AclAdminPermissionResponse> {
    const previousCode = normalizeCanonicalPermissionCode(permissionCode, 'permissionCode');
    const snapshot = await this.loadSnapshot();
    this.requirePermission(snapshot, previousCode);

    const permission = normalizeAclPermissionDefinitionInput(payload, 'permission');
    const appIds = await this.normalizeAppIds(appIdsPayload);
    const resourceIds = this.normalizeResourceIds(snapshot, resourceIdsPayload);
    const persisted = await this.persistSnapshot(
      upsertPermissionInSnapshot(snapshot, permission, resourceIds, previousCode),
      {
        renamedPermissionCodes: previousCode !== permission.code
          ? [
              {
                previousCode,
                nextCode: permission.code
              }
            ]
          : undefined,
        replacedPermissionAppAssignments: [
          {
            permissionCode: permission.code,
            appIds
          }
        ]
      }
    );
    const nextPermission = this.requirePermission(persisted, permission.code);
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_PERMISSION_UPDATE',
      targetType: 'acl-permission',
      targetId: permission.code,
      payload: {
        permission,
        appIds,
        resourceIds
      },
      metadata: {
        previousCode,
        aliasesCount: nextPermission.aliases?.length ?? 0,
        appCount: appIds.length,
        resourceCount: resourceIds.length
      }
    });
    return this.mapPermissionDetail(persisted, nextPermission, new Map([[permission.code, appIds]]));
  }

  async deletePermission(permissionCode: string): Promise<void> {
    const normalizedCode = normalizeCanonicalPermissionCode(permissionCode, 'permissionCode');
    const snapshot = await this.loadSnapshot();
    this.requirePermission(snapshot, normalizedCode);
    await this.persistSnapshot(deletePermissionFromSnapshot(snapshot, normalizedCode), {
      deletedPermissionCodes: [normalizedCode],
    });
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_PERMISSION_DELETE',
      targetType: 'acl-permission',
      targetId: normalizedCode,
      metadata: {
        permissionCode: normalizedCode
      }
    });
  }

  async listResources(): Promise<AclAdminResourceListResponse> {
    const snapshot = await this.loadSnapshot();
    return {
      items: snapshot.resources.map((resource) => this.mapResourceSummary(resource))
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
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_RESOURCE_CREATE',
      targetType: 'acl-resource',
      targetId: resource.id,
      payload: resource,
      metadata: {
        type: nextResource.type,
        permissionCount: nextResource.permissions.length
      }
    });
    return { resource: nextResource };
  }

  async ensureEntityResource(entityId: string): Promise<{ resourceId: string; created: boolean }> {
    const normalizedEntityId = entityId.trim();
    const resourceId = `entity:${normalizedEntityId}`;
    const snapshot = await this.loadSnapshot();

    if (snapshot.resources.some((resource) => resource.id === resourceId)) {
      return {
        resourceId,
        created: false
      };
    }

    const resource = normalizeAclResourceConfigInput(
      {
        id: resourceId,
        type: 'entity',
        permissions: [],
        description: `Auto-provisioned ACL resource for entity ${normalizedEntityId}`
      },
      'resource'
    );
    await this.persistSnapshot(upsertResourceInSnapshot(snapshot, resource));
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_RESOURCE_AUTO_PROVISION',
      targetType: 'acl-resource',
      targetId: resourceId,
      payload: resource,
      metadata: {
        source: 'entity-admin-config',
        type: resource.type
      }
    });

    return {
      resourceId,
      created: true
    };
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
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_RESOURCE_UPDATE',
      targetType: 'acl-resource',
      targetId: resource.id,
      payload: resource,
      metadata: {
        previousId,
        type: nextResource.type,
        permissionCount: nextResource.permissions.length
      }
    });
    return { resource: nextResource };
  }

  async deleteResource(resourceId: string): Promise<void> {
    const normalizedId = resourceId.trim();
    const snapshot = await this.loadSnapshot();
    this.requireResource(snapshot, normalizedId);
    await this.persistSnapshot(deleteResourceFromSnapshot(snapshot, normalizedId));
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_RESOURCE_DELETE',
      targetType: 'acl-resource',
      targetId: normalizedId,
      metadata: {
        resourceId: normalizedId
      }
    });
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
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ACL_DEFAULT_PERMISSIONS_UPDATE',
      targetType: 'acl-default-permissions',
      targetId: 'default-permissions',
      payload: permissionCodes,
      metadata: {
        enabledCount: persisted.defaultPermissions.length
      }
    });
    return this.mapDefaultPermissions(persisted);
  }

  private async loadSnapshot(): Promise<AclConfigSnapshot> {
    return this.aclConfigRepository.loadSnapshot();
  }

  private async persistSnapshot(
    snapshot: AclConfigSnapshot,
    options?: ReplaceAclSnapshotOptions
  ): Promise<AclConfigSnapshot> {
    const normalizedSnapshot = normalizeAclConfigSnapshot(snapshot);
    await this.aclAdminConfigRepository.replaceSnapshot(normalizedSnapshot, options);
    await this.aclService.reload();
    return this.aclConfigRepository.loadSnapshot();
  }

  private mapPermissionSummary(
    snapshot: AclConfigSnapshot,
    permission: AclPermissionDefinition,
    permissionAppIds: Map<string, string[]>
  ): AclAdminPermissionListResponse['items'][number] {
    const appIds = permissionAppIds.get(permission.code) ?? [];
    return {
      code: permission.code,
      label: permission.label,
      description: permission.description,
      aliases: [...(permission.aliases ?? [])],
      isDefault: snapshot.defaultPermissions.includes(permission.code),
      resourceCount: snapshot.resources.filter((resource) => resource.permissions.includes(permission.code)).length,
      appCount: appIds.length
    };
  }

  private mapPermissionDetail(
    snapshot: AclConfigSnapshot,
    permission: AclPermissionDefinition,
    permissionAppIds: Map<string, string[]>
  ): AclAdminPermissionResponse {
    const resources = snapshot.resources
      .filter((resource) => resource.permissions.includes(permission.code))
      .map((resource) => this.mapResourceSummary(resource));
    const appIds = [...(permissionAppIds.get(permission.code) ?? [])];

    return {
      permission: {
        ...permission,
        aliases: [...(permission.aliases ?? [])]
      },
      isDefault: snapshot.defaultPermissions.includes(permission.code),
      resources,
      resourceCount: resources.length,
      appIds,
      appCount: appIds.length
    };
  }

  private mapResourceSummary(resource: AclResourceConfig): AclAdminResourceSummary {
    return {
      id: resource.id,
      type: resource.type,
      target: resource.target,
      description: resource.description,
      permissionCount: resource.permissions.length
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

  private async loadPermissionAppIds(): Promise<Map<string, string[]>> {
    const rows = await this.aclAdminConfigRepository.listPermissionAppAssignments();
    const map = new Map<string, string[]>();

    for (const row of rows) {
      const current = map.get(row.permissionCode);
      if (current) {
        current.push(row.appId);
      } else {
        map.set(row.permissionCode, [row.appId]);
      }
    }

    return map;
  }

  private async normalizeAppIds(value: unknown): Promise<string[]> {
    if (!Array.isArray(value)) {
      throw new BadRequestException('appIds must be an array');
    }

    const appIds = value.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new BadRequestException(`appIds[${index}] must be a non-empty string`);
      }

      const normalized = entry.trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
        throw new BadRequestException(`appIds[${index}] must be lowercase kebab-case`);
      }

      return normalized;
    });
    const uniqueAppIds = [...new Set(appIds)];

    if (uniqueAppIds.length !== appIds.length) {
      throw new BadRequestException('appIds must not contain duplicates');
    }

    await this.aclAdminConfigRepository.assertAppIdsExist(uniqueAppIds);
    return uniqueAppIds;
  }

  private normalizeResourceIds(snapshot: AclConfigSnapshot, value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('resourceIds must be an array');
    }

    const knownResourceIds = new Set(snapshot.resources.map((resource) => resource.id));
    const resourceIds = value.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new BadRequestException(`resourceIds[${index}] must be a non-empty string`);
      }

      const normalized = entry.trim();
      if (normalized.length === 0) {
        throw new BadRequestException(`resourceIds[${index}] must be a non-empty string`);
      }

      if (!knownResourceIds.has(normalized)) {
        throw new BadRequestException(`Unknown resource ids: ${normalized}`);
      }

      return normalized;
    });
    const uniqueResourceIds = [...new Set(resourceIds)];

    if (uniqueResourceIds.length !== resourceIds.length) {
      throw new BadRequestException('resourceIds must not contain duplicates');
    }

    return uniqueResourceIds;
  }
}

function upsertPermissionInSnapshot(
  snapshot: AclConfigSnapshot,
  nextPermission: AclPermissionDefinition,
  resourceIds: string[],
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
  const selectedResourceIds = new Set(resourceIds);
  const resources = snapshot.resources.map((resource) => ({
    ...resource,
    permissions: selectedResourceIds.has(resource.id)
      ? [
          ...resource.permissions
            .map((code) => (previousCode && code === previousCode ? nextCode : code))
            .filter((code) => code !== nextCode),
          nextCode
        ]
      : resource.permissions
          .map((code) => (previousCode && code === previousCode ? nextCode : code))
          .filter((code) => code !== nextCode)
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
