import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';

import { AuditWriteService } from '../audit/audit-write.service';

import type {
  ManualMetadataTypeName,
  MetadataDeployResponse,
  MetadataPreviewResponse,
  MetadataTypeName,
} from './metadata.types';
import {
  DEPLOYABLE_TYPE_ORDER,
  type ExportEntry,
  getTypeDefinition,
} from './services/metadata-common';
import { MetadataDeployApplierService } from './services/metadata-deploy-applier.service';
import { MetadataExportService } from './services/metadata-export.service';
import { MetadataPackageCodecService } from './services/metadata-package-codec.service';
import { MetadataPreviewService } from './services/metadata-preview.service';
import { MetadataSectionResolverService } from './services/metadata-section-resolver.service';

@Injectable()
export class MetadataAdminRuntimeService {
  constructor(
    private readonly auditWriteService: AuditWriteService,
    private readonly packageCodec: MetadataPackageCodecService,
    private readonly exportService: MetadataExportService,
    private readonly previewService: MetadataPreviewService,
    private readonly deployApplier: MetadataDeployApplierService,
    private readonly sectionResolver: MetadataSectionResolverService,
  ) {}

  async exportPackage(sectionInputs?: string[]): Promise<{ buffer: Buffer; filename: string }> {
    const typeNames = this.sectionResolver.resolveRequestedTypeNames(sectionInputs);
    const exportedEntries = new Map<MetadataTypeName, ExportEntry[]>();

    for (const typeName of typeNames) {
      const entries = await this.exportService.loadEntriesForType(typeName);
      if (entries.length > 0) {
        exportedEntries.set(
          typeName,
          entries.sort((left, right) => left.member.localeCompare(right.member)),
        );
      }
    }

    const exportedPackage = this.packageCodec.buildExportPackage(exportedEntries);

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ADMIN_METADATA_EXPORT',
      targetType: 'metadata-package',
      targetId: 'zip-package',
      metadata: {
        sections: typeNames.map((typeName) => getTypeDefinition(typeName).section),
        typeCount: exportedEntries.size,
        fileCount: exportedPackage.fileCount,
      },
    });

    return {
      buffer: exportedPackage.buffer,
      filename: `admin-metadata-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`,
    };
  }

  async previewPackage(buffer: Buffer): Promise<MetadataPreviewResponse> {
    const prepared = await this.previewService.preparePreview(buffer);

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ADMIN_METADATA_PREVIEW',
      targetType: 'metadata-package',
      targetId: 'zip-package',
      metadata: {
        packageHash: prepared.parsed.packageHash,
        blockerCount: prepared.parsed.blockers.length,
        warningCount: prepared.parsed.warnings.length,
        deployableEntryCount: prepared.items.filter((item) => item.category === 'deployable').length,
      },
      result: {
        items: prepared.items.map((item) => ({
          typeName: item.typeName,
          member: item.member,
          change: item.change,
          blockers: item.blockers.length,
          warnings: item.warnings.length,
        })),
      },
    });

    return {
      package: prepared.parsed.descriptor,
      packageHash: prepared.parsed.packageHash,
      targetFingerprint: prepared.targetFingerprint,
      hasBlockers: prepared.parsed.blockers.length > 0,
      hasDeployableEntries: prepared.items.some((item) => item.category === 'deployable'),
      warnings: prepared.parsed.warnings,
      blockers: prepared.parsed.blockers,
      manualActions: prepared.manualActions,
      items: prepared.items,
    };
  }

  async deployPackage(
    buffer: Buffer,
    expectedPackageHash: string,
    expectedTargetFingerprint: string,
  ): Promise<MetadataDeployResponse> {
    const preview = await this.previewService.preparePreview(buffer);

    if (preview.parsed.packageHash !== expectedPackageHash) {
      throw new ConflictException('Metadata package changed since preview');
    }

    if (preview.targetFingerprint !== expectedTargetFingerprint) {
      throw new ConflictException('Target environment changed since preview');
    }

    if (preview.parsed.blockers.length > 0) {
      throw new BadRequestException('Metadata package preview contains blockers');
    }

    const deployableEntries = preview.parsed.entries.filter(
      (entry) => entry.category === 'deployable',
    );

    if (deployableEntries.length === 0) {
      throw new BadRequestException('Metadata package does not contain deployable metadata');
    }

    const auditId = await this.auditWriteService.createApplicationIntentOrThrow({
      action: 'ADMIN_METADATA_DEPLOY',
      targetType: 'metadata-package',
      targetId: 'zip-package',
      payload: {
        packageHash: preview.parsed.packageHash,
      },
      metadata: {
        targetFingerprint: preview.targetFingerprint,
        deployableTypes: [...new Set(deployableEntries.map((entry) => entry.typeName))],
      },
    });

    try {
      const appliedCounts = await this.deployApplier.applyDeployableEntries(deployableEntries);
      const applied = DEPLOYABLE_TYPE_ORDER.map((typeName) => ({
        typeName,
        count: appliedCounts.get(typeName) ?? 0,
      })).filter((entry) => entry.count > 0);

      const response: MetadataDeployResponse = {
        packageHash: preview.parsed.packageHash,
        targetFingerprint: preview.targetFingerprint,
        applied,
        skippedManualTypes: [
          ...new Set(
            preview.parsed.entries
              .filter((entry) => entry.category === 'manual')
              .map((entry) => entry.typeName as ManualMetadataTypeName),
          ),
        ].sort((left, right) => left.localeCompare(right)),
      };

      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'SUCCESS',
        result: response,
      });

      return response;
    } catch (error) {
      await this.auditWriteService.completeApplicationAuditOrThrow({
        auditId,
        status: 'FAILURE',
        errorCode: error instanceof Error ? error.name : 'MetadataDeployError',
        result: {
          message: error instanceof Error ? error.message : 'Unknown metadata deploy error',
        },
      });
      throw error;
    }
  }
}
