import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VisibilityRuleEffect } from '@prisma/client';

import {
  AclAdminConfigRepository,
  type ReplaceAclSnapshotOptions,
} from '../acl/acl-admin-config.repository';
import { AclConfigRepository } from '../acl/acl-config.repository';
import {
  normalizeAclConfigSnapshot,
  normalizeAclResourceConfigInput,
  normalizeAclPermissionDefinitionInput,
} from '../acl/acl-config.validation';
import { AclContactPermissionsRepository } from '../acl/acl-contact-permissions.repository';
import { AclResourceSyncService } from '../acl/acl-resource-sync.service';
import { AclService } from '../acl/acl.service';
import type { AclConfigSnapshot, AclPermissionDefinition, AclResourceConfig } from '../acl/acl.types';
import { AppsAdminConfigRepository } from '../apps/apps-admin-config.repository';
import { AppsAdminService } from '../apps/apps-admin.service';
import type { AppConfig } from '../apps/apps.types';
import { AuditWriteService } from '../audit/audit-write.service';
import { AuthProviderAdminRepository } from '../auth/auth-provider-admin.repository';
import { LocalCredentialAdminService } from '../auth/local-credential-admin.service';
import { LocalCredentialRepository } from '../auth/local-credential.repository';
import { EntityAdminConfigRepository } from '../entities/services/entity-admin-config.repository';
import { EntityAdminConfigService } from '../entities/services/entity-admin-config.service';
import { PrismaService } from '../prisma/prisma.service';
import type { QueryTemplate } from '../query/query.types';
import { QueryAdminTemplateRepository } from '../query/services/query-admin-template.repository';
import { QueryAdminTemplateService } from '../query/services/query-admin-template.service';
import { QueryTemplateRepository } from '../query/services/query-template.repository';
import { SalesforceService } from '../salesforce/salesforce.service';
import { VisibilityAdminService } from '../visibility/visibility-admin.service';

import type {
  DeployableMetadataTypeName,
  ManualMetadataTypeName,
  MetadataContactReference,
  MetadataDeployResponse,
  MetadataPreviewItem,
  MetadataPreviewResponse,
  MetadataSectionName,
  MetadataTypeName,
} from './metadata.types';
import {
  asOptionalString,
  asRecord,
  canonicalStringify,
  comparePreviewItems,
  DEPLOYABLE_TYPE_ORDER,
  type ExportEntry,
  FINGERPRINT_ABSENT,
  FINGERPRINT_UNAVAILABLE,
  getTypeDefinition,
  hashPathTextMap,
  MANUAL_LOCAL_CREDENTIAL_REASON,
  normalizeEmail,
  requireNestedObject,
  requireString,
  SECTION_TO_TYPES,
  TYPE_ORDER,
  uniqueStrings,
} from './services/metadata-common';
import { MetadataEntryNormalizerService } from './services/metadata-entry-normalizer.service';
import {
  MetadataPackageCodecService,
  type ParsedPackage,
  type ParsedPackageEntry,
} from './services/metadata-package-codec.service';

type PreparedPreviewItem = {
  item: MetadataPreviewItem;
  currentFingerprintText: string;
};

type PreparedPreview = {
  parsed: ParsedPackage;
  items: MetadataPreviewItem[];
  targetFingerprint: string;
  manualActions: string[];
};

type TargetContactResolutionMode = 'blocker' | 'warning';

@Injectable()
export class MetadataAdminRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityAdminConfigRepository: EntityAdminConfigRepository,
    private readonly entityAdminConfigService: EntityAdminConfigService,
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly appsAdminService: AppsAdminService,
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly aclAdminConfigRepository: AclAdminConfigRepository,
    private readonly aclContactPermissionsRepository: AclContactPermissionsRepository,
    private readonly aclService: AclService,
    private readonly aclResourceSyncService: AclResourceSyncService,
    private readonly queryAdminTemplateRepository: QueryAdminTemplateRepository,
    private readonly queryAdminTemplateService: QueryAdminTemplateService,
    private readonly queryTemplateRepository: QueryTemplateRepository,
    private readonly visibilityAdminService: VisibilityAdminService,
    private readonly authProviderAdminRepository: AuthProviderAdminRepository,
    private readonly localCredentialAdminService: LocalCredentialAdminService,
    private readonly localCredentialRepository: LocalCredentialRepository,
    private readonly salesforceService: SalesforceService,
    private readonly auditWriteService: AuditWriteService,
    private readonly entryNormalizer: MetadataEntryNormalizerService,
    private readonly packageCodec: MetadataPackageCodecService,
  ) {}

  async exportPackage(sectionInputs?: string[]): Promise<{ buffer: Buffer; filename: string }> {
    const typeNames = this.resolveRequestedTypeNames(sectionInputs);
    const exportedEntries = new Map<MetadataTypeName, ExportEntry[]>();

    for (const typeName of typeNames) {
      const entries = await this.loadExportEntriesForType(typeName);
      if (entries.length > 0) {
        exportedEntries.set(typeName, entries.sort((left, right) => left.member.localeCompare(right.member)));
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
    const prepared = await this.preparePreview(buffer);

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
    const preview = await this.preparePreview(buffer);

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
      const appliedCounts = new Map<DeployableMetadataTypeName, number>();

      await this.applyEntityEntries(
        deployableEntries.filter((entry) => entry.typeName === 'EntityConfig'),
        appliedCounts,
      );
      await this.applyAclEntries(
        deployableEntries.filter((entry) =>
          ['AclPermission', 'AclResource', 'AclDefaultPermission'].includes(entry.typeName)
        ),
        appliedCounts,
      );
      await this.applyQueryTemplateEntries(
        deployableEntries.filter((entry) => entry.typeName === 'QueryTemplate'),
        appliedCounts,
      );
      await this.applyAppEntries(
        deployableEntries.filter((entry) => entry.typeName === 'AppConfig'),
        appliedCounts,
      );
      await this.applyVisibilityEntries(
        deployableEntries.filter((entry) =>
          ['VisibilityCone', 'VisibilityRule', 'VisibilityAssignment'].includes(entry.typeName)
        ),
        appliedCounts,
      );
      await this.applyAclContactPermissionEntries(
        deployableEntries.filter((entry) => entry.typeName === 'AclContactPermission'),
        appliedCounts,
      );
      await this.aclResourceSyncService.syncSystemResources();

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

  private async preparePreview(buffer: Buffer): Promise<PreparedPreview> {
    const parsed = this.packageCodec.parsePackage(buffer);
    const previewItems: MetadataPreviewItem[] = [];
    const fingerprintInputs = new Map<string, string>();
    const globalWarnings = [...parsed.warnings];
    const globalBlockers = [...parsed.blockers];
    const manualActions = new Set<string>();
    const context = this.createResolutionContext();

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
        const snapshot = await this.loadAclSnapshot(context);
        const permission = snapshot.permissions.find((item) => item.code === entry.member);
        return permission
          ? this.entryNormalizer.normalizeEntryForComparison(entry.typeName, entry.member, permission)
          : null;
      }
      case 'AclResource': {
        const snapshot = await this.loadAclSnapshot(context);
        const resource = snapshot.resources.find((item) => item.id === entry.member);
        return resource
          ? this.entryNormalizer.normalizeEntryForComparison(entry.typeName, entry.member, resource)
          : null;
      }
      case 'AclDefaultPermission': {
        const snapshot = await this.loadAclSnapshot(context);
        return snapshot.defaultPermissions.includes(entry.member)
          ? { permissionCode: entry.member }
          : null;
      }
      case 'AclContactPermission': {
        const targetContact = await this.resolveTargetContactByEmail(
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
            contactRef = await this.resolveExportContactReference(row.contactId, context);
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
        const targetContact = await this.resolveTargetContactByEmail(
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

  private async applyEntityEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    for (const entry of entries) {
      const normalizedEntity = this.entityAdminConfigService.normalizeEntityConfigForPersistence(
        entry.member,
        entry.parsedData,
      );
      await this.entityAdminConfigRepository.upsertEntityConfig(normalizedEntity);
    }

    if (entries.length > 0) {
      appliedCounts.set('EntityConfig', entries.length);
    }
  }

  private async applyAclEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    let snapshot = await this.aclConfigRepository.loadSnapshot();
    let replacedPermissionAssignments: ReplaceAclSnapshotOptions['replacedPermissionAppAssignments'];

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

  private async applyQueryTemplateEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    for (const entry of entries) {
      const template = this.queryAdminTemplateService.normalizeTemplateForPersistence(entry.parsedData);
      if (template.id !== entry.member) {
        throw new BadRequestException(`${entry.path} template.id must match file name`);
      }

      await this.queryAdminTemplateRepository.upsertTemplate(template);
      this.queryTemplateRepository.evictTemplate(template.id);
    }

    if (entries.length > 0) {
      appliedCounts.set('QueryTemplate', entries.length);
    }
  }

  private async applyAppEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    for (const entry of entries) {
      const app = await this.appsAdminService.normalizeAppForPersistence(entry.member, entry.parsedData);
      await this.appsAdminConfigRepository.upsertApp(app);
    }

    if (entries.length > 0) {
      appliedCounts.set('AppConfig', entries.length);
    }
  }

  private async applyVisibilityEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const coneEntries = entries.filter((entry) => entry.typeName === 'VisibilityCone');
    const ruleEntries = entries.filter((entry) => entry.typeName === 'VisibilityRule');
    const assignmentEntries = entries.filter((entry) => entry.typeName === 'VisibilityAssignment');
    const coneIdByCode = new Map<string, string>();
    const affectedConeIds = new Set<string>();
    const affectedObjectApiNames = new Set<string>();
    const context = this.createResolutionContext();

    for (const entry of coneEntries) {
      const cone = this.visibilityAdminService.normalizeConeForPersistence(entry.parsedData);
      if (cone.code !== entry.member) {
        throw new BadRequestException(`${entry.path} cone.code must match file name`);
      }

      const existing = await this.prisma.visibilityCone.findUnique({
        where: { code: cone.code },
        select: { id: true },
      });
      const row = await this.prisma.visibilityCone.upsert({
        where: { code: cone.code },
        create: {
          id: existing?.id ?? randomUUID(),
          code: cone.code,
          name: cone.name,
          priority: cone.priority,
          active: cone.active,
        },
        update: {
          code: cone.code,
          name: cone.name,
          priority: cone.priority,
          active: cone.active,
        },
      });

      coneIdByCode.set(cone.code, row.id);
      affectedConeIds.add(row.id);
    }

    for (const entry of ruleEntries) {
      const coneCode = requireString(entry.parsedData?.coneCode, `${entry.path} coneCode is required`);
      const coneId = await this.resolveConeIdByCode(coneCode, coneIdByCode);
      const payload: Record<string, unknown> = {
        ...entry.parsedData,
        id: entry.member,
        coneId,
      };
      delete payload.coneCode;

      const normalizedRule = await this.visibilityAdminService.normalizeRuleForPersistence(payload);
      const existing = await this.prisma.visibilityRule.findUnique({
        where: { id: normalizedRule.id },
        select: {
          objectApiName: true,
          coneId: true,
        },
      });

      await this.prisma.visibilityRule.upsert({
        where: { id: normalizedRule.id },
        create: {
          id: normalizedRule.id,
          coneId: normalizedRule.coneId,
          objectApiName: normalizedRule.objectApiName,
          description: normalizedRule.description ?? null,
          effect: normalizedRule.effect as VisibilityRuleEffect,
          conditionJson: normalizedRule.condition as unknown as Prisma.InputJsonValue,
          fieldsAllowed: normalizedRule.fieldsAllowed?.length
            ? (normalizedRule.fieldsAllowed as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldsDenied: normalizedRule.fieldsDenied?.length
            ? (normalizedRule.fieldsDenied as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          active: normalizedRule.active,
        },
        update: {
          coneId: normalizedRule.coneId,
          objectApiName: normalizedRule.objectApiName,
          description: normalizedRule.description ?? null,
          effect: normalizedRule.effect as VisibilityRuleEffect,
          conditionJson: normalizedRule.condition as unknown as Prisma.InputJsonValue,
          fieldsAllowed: normalizedRule.fieldsAllowed?.length
            ? (normalizedRule.fieldsAllowed as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldsDenied: normalizedRule.fieldsDenied?.length
            ? (normalizedRule.fieldsDenied as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          active: normalizedRule.active,
        },
      });

      affectedConeIds.add(normalizedRule.coneId);
      if (existing?.coneId) {
        affectedConeIds.add(existing.coneId);
      }
      affectedObjectApiNames.add(normalizedRule.objectApiName);
      if (existing?.objectApiName) {
        affectedObjectApiNames.add(existing.objectApiName);
      }
    }

    for (const entry of assignmentEntries) {
      const coneCode = requireString(entry.parsedData?.coneCode, `${entry.path} coneCode is required`);
      const coneId = await this.resolveConeIdByCode(coneCode, coneIdByCode);
      const contactRef = asRecord(entry.parsedData?.contactRef);
      const targetContact = contactRef
        ? await this.resolveTargetContactByEmail(
            normalizeEmail(contactRef.email, `${entry.path} contactRef.email`),
            'blocker',
            [],
            [],
            context,
          )
        : null;

      const payload: Record<string, unknown> = {
        ...entry.parsedData,
        id: entry.member,
        coneId,
        contactId: targetContact?.id,
      };
      delete payload.coneCode;
      delete payload.contactRef;

      const normalizedAssignment = await this.visibilityAdminService.normalizeAssignmentForPersistence(
        payload,
      );
      const existing = await this.prisma.visibilityAssignment.findUnique({
        where: { id: normalizedAssignment.id },
        select: { coneId: true },
      });

      await this.prisma.visibilityAssignment.upsert({
        where: { id: normalizedAssignment.id },
        create: {
          id: normalizedAssignment.id,
          coneId: normalizedAssignment.coneId,
          contactId: normalizedAssignment.contactId ?? null,
          permissionCode: normalizedAssignment.permissionCode ?? null,
          recordType: normalizedAssignment.recordType ?? null,
          validFrom: normalizedAssignment.validFrom ? new Date(normalizedAssignment.validFrom) : null,
          validTo: normalizedAssignment.validTo ? new Date(normalizedAssignment.validTo) : null,
        },
        update: {
          coneId: normalizedAssignment.coneId,
          contactId: normalizedAssignment.contactId ?? null,
          permissionCode: normalizedAssignment.permissionCode ?? null,
          recordType: normalizedAssignment.recordType ?? null,
          validFrom: normalizedAssignment.validFrom ? new Date(normalizedAssignment.validFrom) : null,
          validTo: normalizedAssignment.validTo ? new Date(normalizedAssignment.validTo) : null,
        },
      });

      affectedConeIds.add(normalizedAssignment.coneId);
      if (existing?.coneId) {
        affectedConeIds.add(existing.coneId);
      }
    }

    if (affectedConeIds.size > 0) {
      const rows = await this.prisma.visibilityRule.findMany({
        where: {
          coneId: {
            in: [...affectedConeIds],
          },
        },
        select: {
          objectApiName: true,
        },
        distinct: ['objectApiName'],
      });
      for (const row of rows) {
        affectedObjectApiNames.add(row.objectApiName);
      }
    }

    await this.visibilityAdminService.invalidatePolicyForMetadata([...affectedObjectApiNames]);

    if (coneEntries.length > 0) {
      appliedCounts.set('VisibilityCone', coneEntries.length);
    }
    if (ruleEntries.length > 0) {
      appliedCounts.set('VisibilityRule', ruleEntries.length);
    }
    if (assignmentEntries.length > 0) {
      appliedCounts.set('VisibilityAssignment', assignmentEntries.length);
    }
  }

  private async applyAclContactPermissionEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const snapshot = await this.aclConfigRepository.loadSnapshot();
    const context = this.createResolutionContext();

    for (const entry of entries) {
      const contactRef = requireNestedObject(entry.parsedData, 'contactRef', entry.path);
      const targetContact = await this.resolveTargetContactByEmail(
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

  private async loadExportEntriesForType(typeName: MetadataTypeName): Promise<ExportEntry[]> {
    switch (typeName) {
      case 'EntityConfig': {
        const summaries = await this.entityAdminConfigRepository.listSummaries();
        return Promise.all(
          summaries.map(async (summary) => ({
            member: summary.id,
            data: await this.entityAdminConfigRepository.getEntityConfig(summary.id),
          })),
        );
      }
      case 'AppConfig': {
        const summaries = await this.appsAdminConfigRepository.listSummaries();
        return Promise.all(
          summaries.map(async (summary) => ({
            member: summary.id,
            data: await this.appsAdminConfigRepository.getApp(summary.id),
          })),
        );
      }
      case 'AclPermission': {
        const snapshot = await this.aclConfigRepository.loadSnapshot();
        return snapshot.permissions.map((permission) => ({
          member: permission.code,
          data: permission,
        }));
      }
      case 'AclResource': {
        const snapshot = await this.aclConfigRepository.loadSnapshot();
        return snapshot.resources.map((resource) => ({
          member: resource.id,
          data: resource,
        }));
      }
      case 'AclDefaultPermission': {
        const snapshot = await this.aclConfigRepository.loadSnapshot();
        return snapshot.defaultPermissions.map((permissionCode) => ({
          member: permissionCode,
          data: {
            permissionCode,
          },
        }));
      }
      case 'AclContactPermission': {
        const rows = await this.aclContactPermissionsRepository.listRows();
        const grouped = new Map<string, string[]>();
        const context = this.createResolutionContext();

        for (const row of rows) {
          const existing = grouped.get(row.contactId) ?? [];
          existing.push(row.permissionCode);
          grouped.set(row.contactId, existing);
        }

        return Promise.all(
          [...grouped.entries()].map(async ([contactId, permissionCodes]) => {
            const contactRef = await this.resolveExportContactReference(contactId, context);
            return {
              member: contactRef.email,
              data: {
                contactRef,
                permissionCodes,
              },
            };
          }),
        );
      }
      case 'QueryTemplate': {
        const summaries = await this.queryAdminTemplateRepository.listSummaries();
        return Promise.all(
          summaries.map(async (summary) => ({
            member: summary.id,
            data: await this.queryAdminTemplateRepository.getTemplate(summary.id),
          })),
        );
      }
      case 'VisibilityCone': {
        const rows = await this.prisma.visibilityCone.findMany({
          orderBy: [{ code: 'asc' }],
        });
        return rows.map((row) => ({
          member: row.code,
          data: {
            code: row.code,
            name: row.name,
            priority: row.priority,
            active: row.active,
          },
        }));
      }
      case 'VisibilityRule': {
        const rows = await this.prisma.visibilityRule.findMany({
          orderBy: [{ id: 'asc' }],
          include: {
            cone: true,
          },
        });
        return rows.map((row) => ({
          member: row.id,
          data: {
            id: row.id,
            coneCode: row.cone.code,
            objectApiName: row.objectApiName,
            description: row.description ?? undefined,
            effect: row.effect,
            condition: row.conditionJson,
            fieldsAllowed: Array.isArray(row.fieldsAllowed) ? row.fieldsAllowed : undefined,
            fieldsDenied: Array.isArray(row.fieldsDenied) ? row.fieldsDenied : undefined,
            active: row.active,
          },
        }));
      }
      case 'VisibilityAssignment': {
        const rows = await this.prisma.visibilityAssignment.findMany({
          orderBy: [{ id: 'asc' }],
          include: {
            cone: true,
          },
        });
        const context = this.createResolutionContext();
        return Promise.all(
          rows.map(async (row) => ({
            member: row.id,
            data: {
              id: row.id,
              coneCode: row.cone.code,
              contactRef: row.contactId
                ? await this.resolveExportContactReference(row.contactId, context)
                : undefined,
              permissionCode: row.permissionCode ?? undefined,
              recordType: row.recordType ?? undefined,
              validFrom: row.validFrom?.toISOString(),
              validTo: row.validTo?.toISOString(),
            },
          })),
        );
      }
      case 'AuthProvider': {
        const rows = await this.authProviderAdminRepository.listConfigs();
        return rows.map((row) => ({
          member: row.providerId,
          data: this.entryNormalizer.buildManualAuthProviderRecord(row),
        }));
      }
      case 'LocalCredential': {
        const response = await this.localCredentialAdminService.listCredentials();
        return response.items.map((item) => {
          const email = normalizeEmail(
            item.contactEmail,
            `Local credential ${item.contactId} is missing a Contact email`,
          );
          return {
            member: email,
            data: {
              contactRef: {
                email,
                sourceId: item.contactId,
              },
              username: item.username,
              enabled: item.enabled,
              reason: MANUAL_LOCAL_CREDENTIAL_REASON,
            },
          };
        });
      }
    }
  }

  private async resolveTargetContactByEmail(
    email: string,
    mode: TargetContactResolutionMode,
    blockers: string[],
    warnings: string[],
    context: MetadataResolutionContext,
  ): Promise<{ id: string; email: string } | null> {
    const normalizedEmail = normalizeEmail(email, 'contact email is required');
    let promise = context.targetContactsByEmail.get(normalizedEmail);

    if (!promise) {
      promise = this.salesforceService.findContactByEmail(normalizedEmail).then((contact) =>
        contact?.id
          ? {
              id: contact.id,
              email: normalizedEmail,
            }
          : null,
      );
      context.targetContactsByEmail.set(normalizedEmail, promise);
    }

    try {
      const contact = await promise;
      if (!contact) {
        const message = `Target Contact ${normalizedEmail} was not found in Salesforce`;
        if (mode === 'blocker') {
          blockers.push(message);
        } else {
          warnings.push(message);
        }
      }
      return contact;
    } catch (error) {
      const message =
        error instanceof Error
          ? `Unable to resolve Contact ${normalizedEmail}: ${error.message}`
          : `Unable to resolve Contact ${normalizedEmail}`;
      if (mode === 'blocker') {
        blockers.push(message);
      } else {
        warnings.push(message);
      }
      return null;
    }
  }

  private async resolveExportContactReference(
    contactId: string,
    context: MetadataResolutionContext,
  ): Promise<MetadataContactReference> {
    const normalizedContactId = requireString(contactId, 'contactId is required');
    let promise = context.exportContactsById.get(normalizedContactId);

    if (!promise) {
      promise = (async () => {
        const contact = await this.salesforceService.findContactById(normalizedContactId);
        if (!contact?.email) {
          throw new BadRequestException(
            `Salesforce Contact ${normalizedContactId} is missing a unique email address`,
          );
        }

        const email = normalizeEmail(
          contact.email,
          `Salesforce Contact ${normalizedContactId} email is invalid`,
        );
        const resolved = await this.salesforceService.findContactByEmail(email);
        if (!resolved?.id || resolved.id !== normalizedContactId) {
          throw new BadRequestException(
            `Salesforce Contact ${normalizedContactId} email ${email} is not uniquely resolvable`,
          );
        }

        return {
          email,
          sourceId: normalizedContactId,
        };
      })();
      context.exportContactsById.set(normalizedContactId, promise);
    }

    return promise;
  }

  private async loadAclSnapshot(context: MetadataResolutionContext): Promise<AclConfigSnapshot> {
    if (!context.aclSnapshotPromise) {
      context.aclSnapshotPromise = this.aclConfigRepository.loadSnapshot();
    }

    return context.aclSnapshotPromise;
  }

  private async resolveConeIdByCode(
    coneCode: string,
    coneIdByCode: Map<string, string>,
  ): Promise<string> {
    const normalizedConeCode = requireString(coneCode, 'coneCode is required');
    const cachedId = coneIdByCode.get(normalizedConeCode);
    if (cachedId) {
      return cachedId;
    }

    const row = await this.prisma.visibilityCone.findUnique({
      where: { code: normalizedConeCode },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(`Visibility cone ${normalizedConeCode} not found`);
    }

    coneIdByCode.set(normalizedConeCode, row.id);
    return row.id;
  }

  private createResolutionContext(): MetadataResolutionContext {
    return {
      exportContactsById: new Map(),
      targetContactsByEmail: new Map(),
    };
  }

  private resolveRequestedTypeNames(sectionInputs?: string[]): MetadataTypeName[] {
    if (!sectionInputs || sectionInputs.length === 0) {
      return [...TYPE_ORDER];
    }

    const resolved = new Set<MetadataTypeName>();
    for (const sectionInput of sectionInputs) {
      const section = this.normalizeSectionName(sectionInput);
      for (const typeName of SECTION_TO_TYPES[section]) {
        resolved.add(typeName);
      }
    }

    return TYPE_ORDER.filter((typeName) => resolved.has(typeName));
  }

  private normalizeSectionName(value: string): MetadataSectionName {
    const normalized = requireString(value, 'section name is required') as MetadataSectionName;
    if (!Object.hasOwn(SECTION_TO_TYPES, normalized)) {
      throw new BadRequestException(`Unsupported metadata section ${value}`);
    }

    return normalized;
  }

}

type MetadataResolutionContext = {
  aclSnapshotPromise?: Promise<AclConfigSnapshot>;
  exportContactsById: Map<string, Promise<MetadataContactReference>>;
  targetContactsByEmail: Map<string, Promise<{ id: string; email: string } | null>>;
};

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
