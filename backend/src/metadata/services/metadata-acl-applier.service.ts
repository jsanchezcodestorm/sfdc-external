import { BadRequestException, Injectable } from '@nestjs/common';

import {
  AclAdminConfigRepository,
  type ReplaceAclSnapshotOptions,
} from '../../acl/acl-admin-config.repository';
import { AclConfigRepository } from '../../acl/acl-config.repository';
import {
  normalizeAclConfigSnapshot,
  normalizeAclPermissionDefinitionInput,
  normalizeAclResourceConfigInput,
} from '../../acl/acl-config.validation';
import { AclContactPermissionsRepository } from '../../acl/acl-contact-permissions.repository';
import { AclService } from '../../acl/acl.service';
import type { AclConfigSnapshot, AclPermissionDefinition, AclResourceConfig } from '../../acl/acl.types';
import type { DeployableMetadataTypeName } from '../metadata.types';
import { normalizeEmail, requireNestedObject } from './metadata-common';
import { MetadataEntryNormalizerService } from './metadata-entry-normalizer.service';
import type { ParsedPackageEntry } from './metadata-package-codec.service';
import { MetadataResolutionService } from './metadata-resolution.service';

@Injectable()
export class MetadataAclApplierService {
  constructor(
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly aclAdminConfigRepository: AclAdminConfigRepository,
    private readonly aclContactPermissionsRepository: AclContactPermissionsRepository,
    private readonly aclService: AclService,
    private readonly entryNormalizer: MetadataEntryNormalizerService,
    private readonly resolution: MetadataResolutionService,
  ) {}

  async applyAclEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    let snapshot = await this.aclConfigRepository.loadSnapshot();
    const replacedPermissionAssignments: ReplaceAclSnapshotOptions['replacedPermissionAppAssignments'] =
      undefined;

    for (const entry of entries) {
      switch (entry.typeName) {
        case 'AclPermission': {
          const permission = normalizeAclPermissionDefinitionInput(entry.parsedData, 'permission');
          if (permission.code !== entry.member) {
            throw new BadRequestException(`${entry.path} permission.code must match file name`);
          }

          snapshot = upsertPermission(snapshot, permission);
          break;
        }
        case 'AclResource': {
          const resource = normalizeAclResourceConfigInput(entry.parsedData, 'resource');
          if (resource.id !== entry.member) {
            throw new BadRequestException(`${entry.path} resource.id must match file name`);
          }

          snapshot = upsertResource(snapshot, resource);
          break;
        }
        case 'AclDefaultPermission': {
          const permissionCode = this.entryNormalizer.normalizeDefaultPermissionEntry(entry.parsedData, entry.path);
          if (permissionCode !== entry.member) {
            throw new BadRequestException(`${entry.path} permissionCode must match file name`);
          }

          snapshot = {
            ...snapshot,
            defaultPermissions: orderDefaultPermissions(
              snapshot.permissions,
              [...snapshot.defaultPermissions, permissionCode],
            ),
          };
          break;
        }
        default:
          break;
      }
    }

    snapshot = normalizeAclConfigSnapshot(snapshot);
    await this.aclAdminConfigRepository.replaceSnapshot(snapshot, {
      replacedPermissionAppAssignments: replacedPermissionAssignments,
    });
    await this.aclService.reload();

    for (const entry of entries) {
      const currentCount = appliedCounts.get(entry.typeName as DeployableMetadataTypeName) ?? 0;
      appliedCounts.set(entry.typeName as DeployableMetadataTypeName, currentCount + 1);
    }
  }

  async applyAclContactPermissionEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const snapshot = await this.aclConfigRepository.loadSnapshot();
    const context = this.resolution.createContext();

    for (const entry of entries) {
      const contactRef = requireNestedObject(entry.parsedData, 'contactRef', entry.path);
      const targetContact = await this.resolution.resolveTargetContactByEmail(
        normalizeEmail(contactRef.email, `${entry.path} contactRef.email`),
        'blocker',
        [],
        [],
        context,
      );

      if (!targetContact) {
        throw new BadRequestException(`Target Contact ${entry.member} not found`);
      }

      const permissionCodes = this.entryNormalizer.normalizeAclContactPermissionCodes(
        entry.parsedData?.permissionCodes,
        snapshot,
        entry.path,
      );
      await this.aclContactPermissionsRepository.replaceForContact(targetContact.id, permissionCodes);
    }

    appliedCounts.set('AclContactPermission', entries.length);
  }
}

function upsertPermission(
  snapshot: AclConfigSnapshot,
  nextPermission: AclPermissionDefinition,
): AclConfigSnapshot {
  const exists = snapshot.permissions.some((permission) => permission.code === nextPermission.code);
  return {
    ...snapshot,
    permissions: exists
      ? snapshot.permissions.map((permission) =>
          permission.code === nextPermission.code ? nextPermission : permission
        )
      : [...snapshot.permissions, nextPermission],
  };
}

function upsertResource(
  snapshot: AclConfigSnapshot,
  nextResource: AclResourceConfig,
): AclConfigSnapshot {
  const exists = snapshot.resources.some((resource) => resource.id === nextResource.id);
  return {
    ...snapshot,
    resources: exists
      ? snapshot.resources.map((resource) =>
          resource.id === nextResource.id ? nextResource : resource
        )
      : [...snapshot.resources, nextResource],
  };
}

function orderDefaultPermissions(
  permissions: AclPermissionDefinition[],
  defaultPermissions: string[],
): string[] {
  const enabledCodes = new Set(defaultPermissions);
  return permissions
    .map((permission) => permission.code)
    .filter((permissionCode) => enabledCodes.has(permissionCode));
}
