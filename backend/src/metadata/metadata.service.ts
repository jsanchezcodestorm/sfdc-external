import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VisibilityRuleEffect } from '@prisma/client';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';

import {
  AclAdminConfigRepository,
  type ReplaceAclSnapshotOptions,
} from '../acl/acl-admin-config.repository';
import { AclConfigRepository } from '../acl/acl-config.repository';
import {
  normalizeAclConfigSnapshot,
  normalizeAclResourceConfigInput,
  normalizeAclPermissionDefinitionInput,
  normalizeCanonicalPermissionCode,
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
import { getAuthProviderSlot } from '../auth/auth-provider-catalog';
import { parseStoredOidcProviderConfig } from '../auth/auth-provider-config';
import { LocalCredentialAdminService } from '../auth/local-credential-admin.service';
import { LocalCredentialRepository } from '../auth/local-credential.repository';
import {
  normalizeLegacyEntityMetadataId,
  normalizeLegacyEntityResourceId,
} from '../entities/entity-id-normalization';
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
  MetadataPackageDescriptor,
  MetadataPreviewItem,
  MetadataPreviewResponse,
  MetadataSectionName,
  MetadataTypeMembersDescriptor,
  MetadataTypeName,
} from './metadata.types';
import {
  METADATA_CONTACT_MAPPING,
  METADATA_DEPLOY_MODE,
  METADATA_PACKAGE_FORMAT,
  METADATA_PACKAGE_VERSION,
  METADATA_SECRET_POLICY,
} from './metadata.types';

type MetadataCategory = 'deployable' | 'manual';

type ParsedPackageEntry = {
  typeName: MetadataTypeName;
  member: string;
  path: string;
  category: MetadataCategory;
  rawText: string;
  parsedData?: Record<string, unknown>;
  packageHashText: string;
  compareHashText?: string;
  warnings: string[];
  blockers: string[];
};

type ParsedPackage = {
  descriptor: MetadataPackageDescriptor;
  entries: ParsedPackageEntry[];
  warnings: string[];
  blockers: string[];
  packageHash: string;
};

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

type MetadataTypeDefinition = {
  category: MetadataCategory;
  section: MetadataSectionName;
  pathFromMember: (member: string) => string;
};

type ExportEntry = {
  member: string;
  data: unknown;
};

type TargetContactResolutionMode = 'blocker' | 'warning';

const PACKAGE_ROOT_FILE = 'package.yaml';
const FINGERPRINT_ABSENT = '__ABSENT__';
const FINGERPRINT_UNAVAILABLE = '__UNAVAILABLE__';
const MANUAL_AUTH_PROVIDER_REASON =
  'Manual step: re-enter the provider secret and verify callback settings in the target environment.';
const MANUAL_LOCAL_CREDENTIAL_REASON =
  'Manual step: recreate or reset the local password in the target environment.';

const TYPE_ORDER: MetadataTypeName[] = [
  'EntityConfig',
  'AppConfig',
  'AclPermission',
  'AclResource',
  'AclDefaultPermission',
  'AclContactPermission',
  'QueryTemplate',
  'VisibilityCone',
  'VisibilityRule',
  'VisibilityAssignment',
  'AuthProvider',
  'LocalCredential',
];

const DEPLOYABLE_TYPE_ORDER: DeployableMetadataTypeName[] = TYPE_ORDER.filter((typeName) =>
  !['AuthProvider', 'LocalCredential'].includes(typeName)
) as DeployableMetadataTypeName[];

const TYPE_DEFINITIONS: Record<MetadataTypeName, MetadataTypeDefinition> = {
  EntityConfig: {
    category: 'deployable',
    section: 'entities',
    pathFromMember: (member) => `entities/${member}.yaml`,
  },
  AppConfig: {
    category: 'deployable',
    section: 'apps',
    pathFromMember: (member) => `apps/${member}.yaml`,
  },
  AclPermission: {
    category: 'deployable',
    section: 'acl',
    pathFromMember: (member) => `acl/permissions/${member}.yaml`,
  },
  AclResource: {
    category: 'deployable',
    section: 'acl',
    pathFromMember: (member) => `acl/resources/${encodeURIComponent(member)}.yaml`,
  },
  AclDefaultPermission: {
    category: 'deployable',
    section: 'acl',
    pathFromMember: (member) => `acl/default-permissions/${member}.yaml`,
  },
  AclContactPermission: {
    category: 'deployable',
    section: 'aclContactPermissions',
    pathFromMember: (member) => `acl/contact-permissions/${encodeURIComponent(member)}.yaml`,
  },
  QueryTemplate: {
    category: 'deployable',
    section: 'queryTemplates',
    pathFromMember: (member) => `query-templates/${member}.yaml`,
  },
  VisibilityCone: {
    category: 'deployable',
    section: 'visibility',
    pathFromMember: (member) => `visibility/cones/${member}.yaml`,
  },
  VisibilityRule: {
    category: 'deployable',
    section: 'visibility',
    pathFromMember: (member) => `visibility/rules/${member}.yaml`,
  },
  VisibilityAssignment: {
    category: 'deployable',
    section: 'visibility',
    pathFromMember: (member) => `visibility/assignments/${member}.yaml`,
  },
  AuthProvider: {
    category: 'manual',
    section: 'authProviders',
    pathFromMember: (member) => `manual/auth-providers/${member}.yaml`,
  },
  LocalCredential: {
    category: 'manual',
    section: 'localCredentials',
    pathFromMember: (member) => `manual/local-credentials/${encodeURIComponent(member)}.yaml`,
  },
};

const SECTION_TO_TYPES: Record<MetadataSectionName, MetadataTypeName[]> = {
  entities: ['EntityConfig'],
  apps: ['AppConfig'],
  acl: ['AclPermission', 'AclResource', 'AclDefaultPermission'],
  aclContactPermissions: ['AclContactPermission'],
  queryTemplates: ['QueryTemplate'],
  visibility: ['VisibilityCone', 'VisibilityRule', 'VisibilityAssignment'],
  authProviders: ['AuthProvider'],
  localCredentials: ['LocalCredential'],
};

@Injectable()
export class MetadataAdminService {
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

    const descriptor = this.buildPackageDescriptor(exportedEntries);
    const files = new Map<string, string>();

    files.set(PACKAGE_ROOT_FILE, renderYamlDocument(descriptor));

    for (const typeName of TYPE_ORDER) {
      const entries = exportedEntries.get(typeName) ?? [];
      for (const entry of entries) {
        files.set(
          getTypeDefinition(typeName).pathFromMember(entry.member),
          renderYamlDocument(entry.data),
        );
      }
    }

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'ADMIN_METADATA_EXPORT',
      targetType: 'metadata-package',
      targetId: 'zip-package',
      metadata: {
        sections: typeNames.map((typeName) => getTypeDefinition(typeName).section),
        typeCount: exportedEntries.size,
        fileCount: files.size,
      },
    });

    return {
      buffer: zipFiles(files),
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
    const parsed = await this.parsePackage(buffer);
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

  private async parsePackage(buffer: Buffer): Promise<ParsedPackage> {
    const textEntries = unzipTextEntries(buffer);
    const packageText = textEntries.get(PACKAGE_ROOT_FILE);

    if (!packageText) {
      throw new BadRequestException('Metadata zip must contain package.yaml');
    }

    const descriptor = normalizePackageDescriptor(packageText);
    const entries: ParsedPackageEntry[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];
    const expectedPaths = new Set<string>();
    const packageHashInputs = new Map<string, string>([
      [PACKAGE_ROOT_FILE, canonicalStringify(descriptor)],
    ]);

    for (const collection of [...descriptor.types, ...descriptor.manualTypes]) {
      for (const member of collection.members) {
        const typeDefinition = getTypeDefinition(collection.name);
        const path = typeDefinition.pathFromMember(member);
        expectedPaths.add(path);
      }
    }

    for (const path of textEntries.keys()) {
      if (path === PACKAGE_ROOT_FILE) {
        continue;
      }

      if (!expectedPaths.has(path)) {
        blockers.push(`Unexpected file ${path} is not declared in package.yaml`);
      }
    }

    for (const collection of descriptor.types) {
      for (const member of collection.members) {
        entries.push(
          this.parsePackageEntry(
            collection.name,
            member,
            textEntries,
            packageHashInputs,
          ),
        );
      }
    }

    for (const collection of descriptor.manualTypes) {
      for (const member of collection.members) {
        entries.push(
          this.parsePackageEntry(
            collection.name,
            member,
            textEntries,
            packageHashInputs,
          ),
        );
      }
    }

    return {
      descriptor,
      entries,
      warnings,
      blockers: uniqueStrings(blockers),
      packageHash: hashPathTextMap(packageHashInputs),
    };
  }

  private parsePackageEntry(
    typeName: MetadataTypeName,
    member: string,
    textEntries: Map<string, string>,
    packageHashInputs: Map<string, string>,
  ): ParsedPackageEntry {
    const typeDefinition = getTypeDefinition(typeName);
    const path = typeDefinition.pathFromMember(member);
    const rawText = textEntries.get(path) ?? '';
    const warnings: string[] = [];
    const blockers: string[] = [];
    const entry: ParsedPackageEntry = {
      typeName,
      member,
      path,
      category: typeDefinition.category,
      rawText,
      packageHashText: normalizeMultilineText(rawText),
      warnings,
      blockers,
    };

    if (!textEntries.has(path)) {
      blockers.push(`Missing file ${path}`);
      packageHashInputs.set(path, entry.packageHashText);
      return entry;
    }

    try {
      const parsedValue = loadYaml(rawText);
      if (!isRecord(parsedValue)) {
        throw new BadRequestException(`${path} must contain a YAML object`);
      }

      const normalizedEntryData = this.normalizeEntryForComparison(typeName, member, parsedValue);
      entry.member = getNormalizedMetadataMember(typeName, member, normalizedEntryData);
      entry.parsedData = normalizedEntryData;
      entry.packageHashText = canonicalStringify(parsedValue);
      entry.compareHashText = canonicalStringify(normalizedEntryData);
    } catch (error) {
      blockers.push(
        error instanceof Error ? `Unable to parse ${path}: ${error.message}` : `Unable to parse ${path}`,
      );
    }

    packageHashInputs.set(path, entry.packageHashText);
    return entry;
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
        return this.normalizeEntryForComparison(
          entry.typeName,
          entry.member,
          await this.entityAdminConfigRepository.getEntityConfig(entry.member),
        );
      case 'AppConfig':
        if (!(await this.appsAdminConfigRepository.hasApp(entry.member))) {
          return null;
        }
        return this.normalizeEntryForComparison(
          entry.typeName,
          entry.member,
          await this.appsAdminConfigRepository.getApp(entry.member),
        );
      case 'AclPermission': {
        const snapshot = await this.loadAclSnapshot(context);
        const permission = snapshot.permissions.find((item) => item.code === entry.member);
        return permission
          ? this.normalizeEntryForComparison(entry.typeName, entry.member, permission)
          : null;
      }
      case 'AclResource': {
        const snapshot = await this.loadAclSnapshot(context);
        const resource = snapshot.resources.find((item) => item.id === entry.member);
        return resource
          ? this.normalizeEntryForComparison(entry.typeName, entry.member, resource)
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
        return this.normalizeEntryForComparison(entry.typeName, entry.member, {
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
        return this.normalizeEntryForComparison(entry.typeName, entry.member, {
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

        return this.normalizeEntryForComparison(entry.typeName, entry.member, {
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
        return this.normalizeEntryForComparison(
          entry.typeName,
          entry.member,
          this.buildManualAuthProviderRecord(row),
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

        return this.normalizeEntryForComparison(entry.typeName, entry.member, {
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
          const permissionCode = this.normalizeDefaultPermissionEntry(entry.parsedData, entry.path);
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
      const coneCode = this.requireString(entry.parsedData?.coneCode, `${entry.path} coneCode is required`);
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
      const coneCode = this.requireString(entry.parsedData?.coneCode, `${entry.path} coneCode is required`);
      const coneId = await this.resolveConeIdByCode(coneCode, coneIdByCode);
      const contactRef = isRecord(entry.parsedData?.contactRef)
        ? entry.parsedData?.contactRef
        : undefined;
      const targetContact = contactRef
        ? await this.resolveTargetContactByEmail(
            this.normalizeEmail(contactRef.email, `${entry.path} contactRef.email`),
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
        this.normalizeEmail(contactRef.email, `${entry.path} contactRef.email`),
        'blocker',
        [],
        [],
        context,
      );

      if (!targetContact) {
        throw new BadRequestException(`Target Contact ${entry.member} not found`);
      }

      const permissionCodes = this.normalizeAclContactPermissionCodes(
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
          data: this.buildManualAuthProviderRecord(row),
        }));
      }
      case 'LocalCredential': {
        const response = await this.localCredentialAdminService.listCredentials();
        return response.items.map((item) => {
          const email = this.normalizeEmail(
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

  private buildPackageDescriptor(
    entriesByType: Map<MetadataTypeName, ExportEntry[]>,
  ): MetadataPackageDescriptor {
    const types: MetadataPackageDescriptor['types'] = [];
    const manualTypes: MetadataPackageDescriptor['manualTypes'] = [];

    for (const typeName of TYPE_ORDER) {
      const entries = entriesByType.get(typeName) ?? [];
      if (entries.length === 0) {
        continue;
      }

      const descriptor: MetadataTypeMembersDescriptor = {
        name: typeName,
        members: entries.map((entry) => entry.member).sort((left, right) => left.localeCompare(right)),
      };

      if (getTypeDefinition(typeName).category === 'deployable') {
        types.push(descriptor as MetadataPackageDescriptor['types'][number]);
      } else {
        manualTypes.push(descriptor as MetadataPackageDescriptor['manualTypes'][number]);
      }
    }

    return {
      version: METADATA_PACKAGE_VERSION,
      format: METADATA_PACKAGE_FORMAT,
      contactMapping: METADATA_CONTACT_MAPPING,
      secretPolicy: METADATA_SECRET_POLICY,
      deployMode: METADATA_DEPLOY_MODE,
      types,
      manualTypes,
    };
  }

  private buildManualAuthProviderRecord(row: {
    providerId: string;
    type: 'OIDC' | 'LOCAL';
    label: string | null;
    enabled: boolean;
    sortOrder: number;
    configJson: unknown;
    clientSecretEncrypted: string | null;
  }): Record<string, unknown> {
    const slot = getAuthProviderSlot(row.providerId);
    const parsedConfig = parseStoredOidcProviderConfig(row.providerId, row.configJson);
    const storedConfig = parsedConfig.config;
    const providerFamily = slot?.providerFamily ?? row.providerId;
    const type = slot?.type ?? row.type.toLowerCase();

    return {
      providerId: row.providerId,
      type,
      providerFamily,
      label: row.label ?? slot?.label ?? row.providerId,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      clientId: storedConfig?.clientId,
      issuer: storedConfig?.issuer,
      scopes: storedConfig?.scopes,
      tenantId: storedConfig && 'tenantId' in storedConfig ? storedConfig.tenantId : undefined,
      domain: storedConfig && 'domain' in storedConfig ? storedConfig.domain : undefined,
      reason: MANUAL_AUTH_PROVIDER_REASON,
    };
  }

  private normalizeEntryForComparison(
    typeName: MetadataTypeName,
    member: string,
    value: unknown,
  ): Record<string, unknown> {
    const payload = requireRecord(value, `${typeName} payload must be an object`);
    const normalizedMember = normalizeMetadataMemberForComparison(typeName, member);

    switch (typeName) {
      case 'EntityConfig': {
        const normalizedPayload = normalizeLegacyEntityConfigMetadataPayload(payload);
        const id = this.requireString(normalizedPayload.id, 'entity.id is required');
        if (id !== normalizedMember) {
          throw new BadRequestException(`entities/${member}.yaml must contain matching entity.id`);
        }
        return normalizedPayload;
      }
      case 'AppConfig': {
        const id = this.requireString(payload.id, 'app.id is required');
        if (id !== member) {
          throw new BadRequestException(`apps/${member}.yaml must contain matching app.id`);
        }
        return normalizeLegacyAppConfigMetadataPayload(payload);
      }
      case 'AclPermission': {
        const code = this.requireString(payload.code, 'permission.code is required');
        if (code !== member) {
          throw new BadRequestException(`acl/permissions/${member}.yaml must contain matching code`);
        }
        return payload;
      }
      case 'AclResource': {
        const normalizedPayload = normalizeLegacyAclResourceMetadataPayload(payload);
        const id = this.requireString(normalizedPayload.id, 'resource.id is required');
        if (id !== normalizedMember) {
          throw new BadRequestException(`acl/resources/${member}.yaml must contain matching id`);
        }
        return normalizedPayload;
      }
      case 'AclDefaultPermission': {
        const permissionCode = this.requireString(
          payload.permissionCode,
          'permissionCode is required',
        );
        if (permissionCode !== member) {
          throw new BadRequestException(
            `acl/default-permissions/${member}.yaml must contain matching permissionCode`,
          );
        }
        return { permissionCode };
      }
      case 'AclContactPermission': {
        const contactRef = requireNestedObject(payload, 'contactRef', `acl/contact-permissions/${member}.yaml`);
        const email = this.normalizeEmail(contactRef.email, 'contactRef.email is required');
        if (email !== member) {
          throw new BadRequestException(
            `acl/contact-permissions/${member}.yaml must contain matching contactRef.email`,
          );
        }
        return {
          contactRef: { email },
          permissionCodes: requireStringArray(payload.permissionCodes, 'permissionCodes'),
        };
      }
      case 'QueryTemplate': {
        const id = this.requireString(payload.id, 'template.id is required');
        if (id !== member) {
          throw new BadRequestException(`query-templates/${member}.yaml must contain matching template.id`);
        }
        return payload;
      }
      case 'VisibilityCone': {
        const code = this.requireString(payload.code, 'cone.code is required');
        if (code !== member) {
          throw new BadRequestException(`visibility/cones/${member}.yaml must contain matching cone.code`);
        }
        return payload;
      }
      case 'VisibilityRule': {
        const id = this.requireString(payload.id, 'rule.id is required');
        if (id !== member) {
          throw new BadRequestException(`visibility/rules/${member}.yaml must contain matching rule.id`);
        }
        this.requireString(payload.coneCode, 'rule.coneCode is required');
        return payload;
      }
      case 'VisibilityAssignment': {
        const id = this.requireString(payload.id, 'assignment.id is required');
        if (id !== member) {
          throw new BadRequestException(
            `visibility/assignments/${member}.yaml must contain matching assignment.id`,
          );
        }
        this.requireString(payload.coneCode, 'assignment.coneCode is required');
        return {
          ...payload,
          contactRef: isRecord(payload.contactRef)
            ? {
                email: this.normalizeEmail(payload.contactRef.email, 'contactRef.email is required'),
              }
            : undefined,
        };
      }
      case 'AuthProvider': {
        const providerId = this.requireString(payload.providerId, 'providerId is required');
        if (providerId !== member) {
          throw new BadRequestException(
            `manual/auth-providers/${member}.yaml must contain matching providerId`,
          );
        }
        return payload;
      }
      case 'LocalCredential': {
        const contactRef = requireNestedObject(
          payload,
          'contactRef',
          `manual/local-credentials/${member}.yaml`,
        );
        const email = this.normalizeEmail(contactRef.email, 'contactRef.email is required');
        if (email !== member) {
          throw new BadRequestException(
            `manual/local-credentials/${member}.yaml must contain matching contactRef.email`,
          );
        }
        return {
          ...payload,
          contactRef: { email },
        };
      }
    }
  }

  private normalizeDefaultPermissionEntry(value: unknown, path: string): string {
    const payload = requireRecord(value, `${path} must contain an object`);
    return normalizeCanonicalPermissionCode(payload.permissionCode, `${path} permissionCode`);
  }

  private normalizeAclContactPermissionCodes(
    value: unknown,
    snapshot: AclConfigSnapshot,
    path: string,
  ): string[] {
    const permissionCodes = requireStringArray(value, `${path} permissionCodes`).map((entry, index) =>
      normalizeCanonicalPermissionCode(entry, `${path} permissionCodes[${index}]`),
    );
    const uniqueCodes = [...new Set(permissionCodes)];
    const definedCodes = new Set(snapshot.permissions.map((permission) => permission.code));
    const defaultCodes = new Set(snapshot.defaultPermissions);

    if (uniqueCodes.length === 0) {
      throw new BadRequestException(`${path} must contain at least one explicit permission`);
    }

    for (const permissionCode of uniqueCodes) {
      if (!definedCodes.has(permissionCode)) {
        throw new BadRequestException(`${path} references undefined permission ${permissionCode}`);
      }

      if (defaultCodes.has(permissionCode)) {
        throw new BadRequestException(
          `${path} references ${permissionCode}, which is already a default permission`,
        );
      }
    }

    return uniqueCodes;
  }

  private async resolveTargetContactByEmail(
    email: string,
    mode: TargetContactResolutionMode,
    blockers: string[],
    warnings: string[],
    context: MetadataResolutionContext,
  ): Promise<{ id: string; email: string } | null> {
    const normalizedEmail = this.normalizeEmail(email, 'contact email is required');
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
    const normalizedContactId = this.requireString(contactId, 'contactId is required');
    let promise = context.exportContactsById.get(normalizedContactId);

    if (!promise) {
      promise = (async () => {
        const contact = await this.salesforceService.findContactById(normalizedContactId);
        if (!contact?.email) {
          throw new BadRequestException(
            `Salesforce Contact ${normalizedContactId} is missing a unique email address`,
          );
        }

        const email = this.normalizeEmail(
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
    const normalizedConeCode = this.requireString(coneCode, 'coneCode is required');
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
    const normalized = this.requireString(value, 'section name is required') as MetadataSectionName;
    if (!Object.hasOwn(SECTION_TO_TYPES, normalized)) {
      throw new BadRequestException(`Unsupported metadata section ${value}`);
    }

    return normalized;
  }

  private normalizeEmail(value: unknown, errorMessage: string): string {
    const normalized = this.requireString(value, errorMessage).toLowerCase();
    if (!normalized.includes('@')) {
      throw new BadRequestException(errorMessage);
    }
    return normalized;
  }

  private requireString(value: unknown, errorMessage: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(errorMessage);
    }

    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(errorMessage);
    }

    return normalized;
  }
}

type MetadataResolutionContext = {
  aclSnapshotPromise?: Promise<AclConfigSnapshot>;
  exportContactsById: Map<string, Promise<MetadataContactReference>>;
  targetContactsByEmail: Map<string, Promise<{ id: string; email: string } | null>>;
};

function normalizePackageDescriptor(rawText: string): MetadataPackageDescriptor {
  const rawValue = loadYaml(rawText);
  const payload = requireRecord(rawValue, 'package.yaml must contain an object');
  const version = Number(payload.version);
  const format = asOptionalString(payload.format);
  const contactMapping = asOptionalString(payload.contactMapping);
  const secretPolicy = asOptionalString(payload.secretPolicy);
  const deployMode = asOptionalString(payload.deployMode);

  if (version !== METADATA_PACKAGE_VERSION) {
    throw new BadRequestException(`package.yaml version must be ${METADATA_PACKAGE_VERSION}`);
  }

  if (format !== METADATA_PACKAGE_FORMAT) {
    throw new BadRequestException(`package.yaml format must be ${METADATA_PACKAGE_FORMAT}`);
  }

  if (contactMapping !== METADATA_CONTACT_MAPPING) {
    throw new BadRequestException(`package.yaml contactMapping must be ${METADATA_CONTACT_MAPPING}`);
  }

  if (secretPolicy !== METADATA_SECRET_POLICY) {
    throw new BadRequestException(`package.yaml secretPolicy must be ${METADATA_SECRET_POLICY}`);
  }

  if (deployMode !== METADATA_DEPLOY_MODE) {
    throw new BadRequestException(`package.yaml deployMode must be ${METADATA_DEPLOY_MODE}`);
  }

  return {
    version,
    format,
    contactMapping: METADATA_CONTACT_MAPPING,
    secretPolicy: METADATA_SECRET_POLICY,
    deployMode: METADATA_DEPLOY_MODE,
    types: normalizeTypeCollection(
      payload.types,
      'types',
      'deployable',
    ) as MetadataPackageDescriptor['types'],
    manualTypes: normalizeTypeCollection(
      payload.manualTypes,
      'manualTypes',
      'manual',
    ) as MetadataPackageDescriptor['manualTypes'],
  };
}

function getNormalizedMetadataMember(
  typeName: MetadataTypeName,
  member: string,
  normalizedPayload: Record<string, unknown>
): string {
  switch (typeName) {
    case 'EntityConfig':
      return typeof normalizedPayload.id === 'string'
        ? normalizedPayload.id
        : normalizeMetadataMemberForComparison(typeName, member);
    case 'AclResource':
      return typeof normalizedPayload.id === 'string'
        ? normalizedPayload.id
        : normalizeMetadataMemberForComparison(typeName, member);
    default:
      return normalizeMetadataMemberForComparison(typeName, member);
  }
}

function normalizeMetadataMemberForComparison(typeName: MetadataTypeName, member: string): string {
  switch (typeName) {
    case 'EntityConfig':
      return normalizeLegacyEntityMetadataId(member);
    case 'AclResource':
      return normalizeLegacyEntityResourceId(member);
    default:
      return member.trim();
  }
}

function normalizeLegacyEntityConfigMetadataPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...payload,
    id:
      typeof payload.id === 'string'
        ? normalizeLegacyEntityMetadataId(payload.id)
        : payload.id,
  };

  const detail = asRecord(payload.detail);
  const relatedLists = Array.isArray(detail?.relatedLists)
    ? detail.relatedLists.map((entry) => {
        const relatedList = asRecord(entry);
        if (!relatedList) {
          return entry;
        }

        return {
          ...relatedList,
          entityId:
            typeof relatedList.entityId === 'string'
              ? normalizeLegacyEntityMetadataId(relatedList.entityId)
              : relatedList.entityId,
        };
      })
    : undefined;

  if (detail && relatedLists) {
    normalized.detail = {
      ...detail,
      relatedLists,
    };
  }

  return normalized;
}

function normalizeLegacyAclResourceMetadataPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const normalizedId =
    typeof payload.id === 'string' ? normalizeLegacyEntityResourceId(payload.id) : payload.id;
  const normalizedType = typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : undefined;
  const normalizedSourceType =
    typeof payload.sourceType === 'string' ? payload.sourceType.trim().toLowerCase() : undefined;

  return {
    ...payload,
    id: normalizedId,
    sourceRef:
      typeof payload.sourceRef === 'string' &&
      (normalizedType === 'entity' || normalizedSourceType === 'entity')
        ? normalizeLegacyEntityMetadataId(payload.sourceRef)
        : payload.sourceRef,
  };
}

function normalizeLegacyAppConfigMetadataPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (!Array.isArray(payload.items)) {
    return payload;
  }

  return {
    ...payload,
    items: payload.items.map((entry) => {
      const item = asRecord(entry);
      if (!item) {
        return entry;
      }

      return {
        ...item,
        entityId:
          typeof item.entityId === 'string'
            ? normalizeLegacyEntityMetadataId(item.entityId)
            : item.entityId,
        resourceId:
          typeof item.resourceId === 'string'
            ? normalizeLegacyEntityResourceId(item.resourceId)
            : item.resourceId,
      };
    }),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeTypeCollection(
  value: unknown,
  fieldName: string,
  category: MetadataCategory,
): MetadataTypeMembersDescriptor[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException(`package.yaml ${fieldName} must be an array`);
  }

  const seenNames = new Set<string>();

  return value.map((entry, index) => {
    const payload = requireRecord(entry, `package.yaml ${fieldName}[${index}] must be an object`);
    const name = requireNonEmptyString(payload.name, `package.yaml ${fieldName}[${index}].name`);
    const normalizedName = name as MetadataTypeName;
    const typeDefinition = getTypeDefinition(normalizedName);

    if (typeDefinition.category !== category) {
      throw new BadRequestException(
        `package.yaml ${fieldName}[${index}].name ${name} belongs to ${typeDefinition.category} types`,
      );
    }

    if (seenNames.has(normalizedName)) {
      throw new BadRequestException(`package.yaml ${fieldName} contains duplicate type ${name}`);
    }
    seenNames.add(normalizedName);

    const members = requireStringArray(
      payload.members,
      `package.yaml ${fieldName}[${index}].members`,
    )
      .map((member) => requireNonEmptyString(member, `package.yaml ${fieldName}[${index}].members`))
      .map((member) => normalizeMember(normalizedName, member))
      .filter((member, memberIndex, source) => source.indexOf(member) === memberIndex)
      .sort((left, right) => left.localeCompare(right));

    return { name: normalizedName, members };
  });
}

function normalizeMember(typeName: MetadataTypeName, member: string): string {
  switch (typeName) {
    case 'AclResource':
      return member.trim();
    case 'AclContactPermission':
    case 'LocalCredential':
      return member.trim().toLowerCase();
    default:
      return member.trim();
  }
}

function getTypeDefinition(typeName: string): MetadataTypeDefinition {
  const definition = TYPE_DEFINITIONS[typeName as MetadataTypeName];
  if (!definition) {
    throw new BadRequestException(`Unsupported metadata type ${typeName}`);
  }

  return definition;
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

function comparePreviewItems(left: MetadataPreviewItem, right: MetadataPreviewItem): number {
  const leftTypeOrder = TYPE_ORDER.indexOf(left.typeName);
  const rightTypeOrder = TYPE_ORDER.indexOf(right.typeName);
  if (leftTypeOrder !== rightTypeOrder) {
    return leftTypeOrder - rightTypeOrder;
  }

  return left.path.localeCompare(right.path);
}

function zipFiles(files: Map<string, string>): Buffer {
  const payload: Record<string, Uint8Array> = {};
  for (const path of [...files.keys()].sort((left, right) => left.localeCompare(right))) {
    payload[path] = strToU8(files.get(path) ?? '');
  }

  return Buffer.from(zipSync(payload));
}

function unzipTextEntries(buffer: Buffer): Map<string, string> {
  try {
    const archive = unzipSync(new Uint8Array(buffer));
    const entries = new Map<string, string>();

    for (const [path, contents] of Object.entries(archive)) {
      const normalizedPath = normalizeArchivePath(path);
      if (!normalizedPath || shouldIgnoreArchivePath(normalizedPath)) {
        continue;
      }

      entries.set(normalizedPath, normalizeMultilineText(strFromU8(contents)));
    }

    return entries;
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? `Invalid metadata zip: ${error.message}` : 'Invalid metadata zip',
    );
  }
}

function normalizeArchivePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '').trim();
}

function shouldIgnoreArchivePath(path: string): boolean {
  return (
    path.length === 0 ||
    path.endsWith('/') ||
    path.startsWith('__MACOSX/') ||
    path.endsWith('/.DS_Store') ||
    path === '.DS_Store'
  );
}

function hashPathTextMap(values: Map<string, string>): string {
  const hasher = createHash('sha256');
  for (const path of [...values.keys()].sort((left, right) => left.localeCompare(right))) {
    hasher.update(path, 'utf8');
    hasher.update('\n', 'utf8');
    hasher.update(values.get(path) ?? '', 'utf8');
    hasher.update('\n---\n', 'utf8');
  }

  return hasher.digest('hex');
}

function renderYamlDocument(value: unknown): string {
  const yaml = dumpYaml(canonicalizeValue(value), {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });

  return normalizeMultilineText(yaml.endsWith('\n') ? yaml : `${yaml}\n`);
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      normalized[key] = canonicalizeValue(entry);
    }
    return normalized;
  }

  return value;
}

function normalizeMultilineText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException(message);
  }

  return value;
}

function requireNestedObject(
  value: unknown,
  fieldName: string,
  context: string,
): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value[fieldName])) {
    throw new BadRequestException(`${context} ${fieldName} is required`);
  }

  return value[fieldName] as Record<string, unknown>;
}

function requireStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${context} must be an array`);
  }

  return value.map((entry, index) => requireNonEmptyString(entry, `${context}[${index}]`));
}

function requireNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${context} must be a non-empty string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(`${context} must be a non-empty string`);
  }

  return normalized;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
