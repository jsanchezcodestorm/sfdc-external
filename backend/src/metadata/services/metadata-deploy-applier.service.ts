import { Injectable } from '@nestjs/common';

import { AclResourceSyncService } from '../../acl/acl-resource-sync.service';
import type { DeployableMetadataTypeName } from '../metadata.types';
import { MetadataAclApplierService } from './metadata-acl-applier.service';
import { MetadataBasicApplierService } from './metadata-basic-applier.service';
import type { ParsedPackageEntry } from './metadata-package-codec.service';
import { MetadataVisibilityApplierService } from './metadata-visibility-applier.service';

@Injectable()
export class MetadataDeployApplierService {
  constructor(
    private readonly basicApplier: MetadataBasicApplierService,
    private readonly aclApplier: MetadataAclApplierService,
    private readonly visibilityApplier: MetadataVisibilityApplierService,
    private readonly aclResourceSyncService: AclResourceSyncService,
  ) {}

  async applyDeployableEntries(
    deployableEntries: ParsedPackageEntry[],
  ): Promise<Map<DeployableMetadataTypeName, number>> {
    const appliedCounts = new Map<DeployableMetadataTypeName, number>();

    await this.basicApplier.applyEntityEntries(
      deployableEntries.filter((entry) => entry.typeName === 'EntityConfig'),
      appliedCounts,
    );
    await this.aclApplier.applyAclEntries(
      deployableEntries.filter((entry) =>
        ['AclPermission', 'AclResource', 'AclDefaultPermission'].includes(entry.typeName)
      ),
      appliedCounts,
    );
    await this.basicApplier.applyQueryTemplateEntries(
      deployableEntries.filter((entry) => entry.typeName === 'QueryTemplate'),
      appliedCounts,
    );
    await this.basicApplier.applyAppEntries(
      deployableEntries.filter((entry) => entry.typeName === 'AppConfig'),
      appliedCounts,
    );
    await this.visibilityApplier.applyVisibilityEntries(
      deployableEntries.filter((entry) =>
        ['VisibilityCone', 'VisibilityRule', 'VisibilityAssignment'].includes(entry.typeName)
      ),
      appliedCounts,
    );
    await this.aclApplier.applyAclContactPermissionEntries(
      deployableEntries.filter((entry) => entry.typeName === 'AclContactPermission'),
      appliedCounts,
    );
    await this.aclResourceSyncService.syncSystemResources();

    return appliedCounts;
  }
}
