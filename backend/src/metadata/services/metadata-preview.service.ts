import { Injectable } from '@nestjs/common';

import { AclContactPermissionsRepository } from '../../acl/acl-contact-permissions.repository';
import { AppsAdminConfigRepository } from '../../apps/apps-admin-config.repository';
import { AuthProviderAdminRepository } from '../../auth/auth-provider-admin.repository';
import { LocalCredentialRepository } from '../../auth/local-credential.repository';
import { EntityAdminConfigRepository } from '../../entities/services/entity-admin-config.repository';
import { PrismaService } from '../../prisma/prisma.service';
import type { QueryTemplate } from '../../query/query.types';
import type { MetadataContactReference, MetadataPreviewItem } from '../metadata.types';
import {
  asOptionalString,
  canonicalStringify,
  comparePreviewItems,
  FINGERPRINT_ABSENT,
  FINGERPRINT_UNAVAILABLE,
  hashPathTextMap,
  MANUAL_LOCAL_CREDENTIAL_REASON,
  uniqueStrings,
} from './metadata-common';
import { MetadataEntryNormalizerService } from './metadata-entry-normalizer.service';
import {
  MetadataPackageCodecService,
  type ParsedPackage,
  type ParsedPackageEntry,
} from './metadata-package-codec.service';
import { MetadataResolutionService, type MetadataResolutionContext } from './metadata-resolution.service';

type PreparedPreviewItem = {
  item: MetadataPreviewItem;
  currentFingerprintText: string;
};

export type PreparedMetadataPreview = {
  parsed: ParsedPackage;
  items: MetadataPreviewItem[];
  targetFingerprint: string;
  manualActions: string[];
};

@Injectable()
export class MetadataPreviewService {
  constructor(
    private readonly entityAdminConfigRepository: EntityAdminConfigRepository,
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly aclContactPermissionsRepository: AclContactPermissionsRepository,
    private readonly authProviderAdminRepository: AuthProviderAdminRepository,
    private readonly localCredentialRepository: LocalCredentialRepository,
    private readonly prisma: PrismaService,
    private readonly entryNormalizer: MetadataEntryNormalizerService,
    private readonly packageCodec: MetadataPackageCodecService,
    private readonly resolution: MetadataResolutionService,
  ) {}

  async preparePreview(buffer: Buffer): Promise<PreparedMetadataPreview> {
    const parsed = this.packageCodec.parsePackage(buffer);
    const previewItems: MetadataPreviewItem[] = [];
    const fingerprintInputs = new Map<string, string>();
    const globalWarnings = [...parsed.warnings];
    const globalBlockers = [...parsed.blockers];
    const manualActions = new Set<string>();
    const context = this.resolution.createContext();

    for (const entry of parsed.entries) {
      const preparedItem = await this.preparePreviewItem(entry, context);
      previewItems.push(preparedItem.item);

      if (entry.category === 'deployable') {
        fingerprintInputs.set(entry.path, preparedItem.currentFingerprintText);
      }

      globalWarnings.push(...preparedItem.item.warnings);
      globalBlockers.push(...preparedItem.item.blockers);

      if (entry.category === 'manual') {
        const reason = asOptionalString(entry.parsedData?.reason);
        manualActions.add(reason ? `${entry.path}: ${reason}` : `${entry.path}: Manual review required.`);
      }
    }

    parsed.warnings = uniqueStrings(globalWarnings);
    parsed.blockers = uniqueStrings(globalBlockers);

    return {
      parsed,
      items: previewItems.sort(comparePreviewItems),
      targetFingerprint: hashPathTextMap(fingerprintInputs),
      manualActions: [...manualActions].sort((left, right) => left.localeCompare(right)),
    };
  }

  private async preparePreviewItem(
    entry: ParsedPackageEntry,
    context: MetadataResolutionContext,
  ): Promise<PreparedPreviewItem> {
    const warnings = [...entry.warnings];
    const blockers = [...entry.blockers];
    let currentFingerprintText = FINGERPRINT_ABSENT;
    let change: MetadataPreviewItem['change'] = 'create';

    if (entry.parsedData && blockers.length === 0) {
      const currentData = await this.loadCurrentComparableData(entry, context, warnings, blockers);
      if (currentData) {
        currentFingerprintText = canonicalStringify(currentData);
        change =
          entry.compareHashText === currentFingerprintText
            ? 'unchanged'
            : 'update';
      }
    } else {
      currentFingerprintText = FINGERPRINT_UNAVAILABLE;
    }

    return {
      item: {
        typeName: entry.typeName,
        member: entry.member,
        path: entry.path,
        category: entry.category,
        change,
        warnings: uniqueStrings(warnings),
        blockers: uniqueStrings(blockers),
      },
      currentFingerprintText,
    };
  }

  private async loadCurrentComparableData(
    entry: ParsedPackageEntry,
    context: MetadataResolutionContext,
    warnings: string[],
    blockers: string[],
  ): Promise<Record<string, unknown> | null> {
    switch (entry.typeName) {
      case 'EntityConfig':
        if (!(await this.entityAdminConfigRepository.hasEntityConfig(entry.member))) {
          return null;
        }
        return this.entryNormalizer.normalizeEntryForComparison(
          entry.typeName,
          entry.member,
          await this.entityAdminConfigRepository.getEntityConfig(entry.member),
        );
      case 'AppConfig':
        if (!(await this.appsAdminConfigRepository.hasApp(entry.member))) {
          return null;
        }
        return this.entryNormalizer.normalizeEntryForComparison(
          entry.typeName,
          entry.member,
          await this.appsAdminConfigRepository.getApp(entry.member),
        );
      case 'AclPermission': {
        const snapshot = await this.resolution.loadAclSnapshot(context);
        const permission = snapshot.permissions.find((item) => item.code === entry.member);
        return permission
          ? this.entryNormalizer.normalizeEntryForComparison(entry.typeName, entry.member, permission)
          : null;
      }
      case 'AclResource': {
        const snapshot = await this.resolution.loadAclSnapshot(context);
        const resource = snapshot.resources.find((item) => item.id === entry.member);
        return resource
          ? this.entryNormalizer.normalizeEntryForComparison(entry.typeName, entry.member, resource)
          : null;
      }
      case 'AclDefaultPermission': {
        const snapshot = await this.resolution.loadAclSnapshot(context);
        return snapshot.defaultPermissions.includes(entry.member)
          ? { permissionCode: entry.member }
          : null;
      }
      case 'AclContactPermission': {
        const targetContact = await this.resolution.resolveTargetContactByEmail(
          entry.member,
          entry.category === 'deployable' ? 'blocker' : 'warning',
          blockers,
          warnings,
          context,
        );
        if (!targetContact) {
          return null;
        }

        const rows = await this.aclContactPermissionsRepository.findByContactId(targetContact.id);
        if (rows.length === 0) {
          return null;
        }

        return {
          contactRef: {
            email: targetContact.email,
          },
          permissionCodes: rows.map((row) => row.permissionCode),
        };
      }
      case 'QueryTemplate': {
        const row = await this.prisma.queryTemplateRecord.findUnique({
          where: { id: entry.member },
        });
        if (!row) {
          return null;
        }
        return this.entryNormalizer.normalizeEntryForComparison(entry.typeName, entry.member, {
          id: row.id,
          objectApiName: row.objectApiName,
          description: row.description ?? undefined,
          soql: row.soql,
          defaultParams:
            row.defaultParamsJson &&
            !Array.isArray(row.defaultParamsJson) &&
            typeof row.defaultParamsJson === 'object'
              ? (row.defaultParamsJson as QueryTemplate['defaultParams'])
              : undefined,
          maxLimit: typeof row.maxLimit === 'number' ? row.maxLimit : undefined,
        });
      }
      case 'VisibilityCone': {
        const row = await this.prisma.visibilityCone.findUnique({
          where: { code: entry.member },
        });
        if (!row) {
          return null;
        }
        return {
          code: row.code,
          name: row.name,
          priority: row.priority,
          active: row.active,
        };
      }
      case 'VisibilityRule': {
        const row = await this.prisma.visibilityRule.findUnique({
          where: { id: entry.member },
          include: {
            cone: true,
          },
        });
        if (!row) {
          return null;
        }
        return this.entryNormalizer.normalizeEntryForComparison(entry.typeName, entry.member, {
          id: row.id,
          coneCode: row.cone.code,
          objectApiName: row.objectApiName,
          description: row.description ?? undefined,
          effect: row.effect,
          condition: row.conditionJson,
          fieldsAllowed: Array.isArray(row.fieldsAllowed) ? row.fieldsAllowed : undefined,
          fieldsDenied: Array.isArray(row.fieldsDenied) ? row.fieldsDenied : undefined,
          active: row.active,
        });
      }
      case 'VisibilityAssignment': {
        const row = await this.prisma.visibilityAssignment.findUnique({
          where: { id: entry.member },
          include: {
            cone: true,
          },
        });
        if (!row) {
          return null;
        }

        let contactRef: MetadataContactReference | undefined;
        if (row.contactId) {
          try {
            contactRef = await this.resolution.resolveExportContactReference(row.contactId, context);
          } catch (error) {
            blockers.push(
              error instanceof Error
                ? `Unable to resolve Contact ${row.contactId} for current target state: ${error.message}`
                : `Unable to resolve Contact ${row.contactId} for current target state`,
            );
            return null;
          }
        }

        return this.entryNormalizer.normalizeEntryForComparison(entry.typeName, entry.member, {
          id: row.id,
          coneCode: row.cone.code,
          contactRef,
          permissionCode: row.permissionCode ?? undefined,
          recordType: row.recordType ?? undefined,
          validFrom: row.validFrom?.toISOString(),
          validTo: row.validTo?.toISOString(),
        });
      }
      case 'AuthProvider': {
        const row = await this.authProviderAdminRepository.findConfig(entry.member);
        if (!row) {
          return null;
        }
        return this.entryNormalizer.normalizeEntryForComparison(
          entry.typeName,
          entry.member,
          this.entryNormalizer.buildManualAuthProviderRecord(row),
        );
      }
      case 'LocalCredential': {
        const targetContact = await this.resolution.resolveTargetContactByEmail(
          entry.member,
          'warning',
          blockers,
          warnings,
          context,
        );
        if (!targetContact) {
          return null;
        }

        const row = await this.localCredentialRepository.findByContactId(targetContact.id);
        if (!row) {
          return null;
        }

        return this.entryNormalizer.normalizeEntryForComparison(entry.typeName, entry.member, {
          contactRef: {
            email: targetContact.email,
          },
          username: row.username,
          enabled: row.enabled,
          reason: MANUAL_LOCAL_CREDENTIAL_REASON,
        });
      }
    }
  }
}
