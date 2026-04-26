import { BadRequestException, Injectable } from '@nestjs/common';
import { load as loadYaml } from 'js-yaml';

import type { MetadataPackageDescriptor, MetadataTypeMembersDescriptor, MetadataTypeName } from '../metadata.types';
import {
  METADATA_CONTACT_MAPPING,
  METADATA_DEPLOY_MODE,
  METADATA_PACKAGE_FORMAT,
  METADATA_PACKAGE_VERSION,
  METADATA_SECRET_POLICY,
} from '../metadata.types';
import { MetadataEntryNormalizerService } from './metadata-entry-normalizer.service';
import {
  buildPackageDescriptor,
  canonicalStringify,
  type ExportEntry,
  getTypeDefinition,
  hashPathTextMap,
  isRecord,
  type MetadataCategory,
  normalizeMultilineText,
  PACKAGE_ROOT_FILE,
  renderYamlDocument,
  requireNonEmptyString,
  requireRecord,
  requireStringArray,
  TYPE_ORDER,
  uniqueStrings,
  unzipTextEntries,
  zipFiles,
} from './metadata-common';

export type ParsedPackageEntry = {
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

export type ParsedPackage = {
  descriptor: MetadataPackageDescriptor;
  entries: ParsedPackageEntry[];
  warnings: string[];
  blockers: string[];
  packageHash: string;
};

@Injectable()
export class MetadataPackageCodecService {
  constructor(private readonly entryNormalizer: MetadataEntryNormalizerService) {}

  buildExportPackage(entriesByType: Map<MetadataTypeName, ExportEntry[]>): { buffer: Buffer; fileCount: number } {
    const descriptor = buildPackageDescriptor(entriesByType);
    const files = new Map<string, string>();

    files.set(PACKAGE_ROOT_FILE, renderYamlDocument(descriptor));

    for (const typeName of TYPE_ORDER) {
      const entries = entriesByType.get(typeName) ?? [];
      for (const entry of entries) {
        files.set(
          getTypeDefinition(typeName).pathFromMember(entry.member),
          renderYamlDocument(entry.data),
        );
      }
    }

    return {
      buffer: zipFiles(files),
      fileCount: files.size,
    };
  }

  parsePackage(buffer: Buffer): ParsedPackage {
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
        expectedPaths.add(getTypeDefinition(collection.name).pathFromMember(member));
      }
    }

    for (const path of textEntries.keys()) {
      if (path !== PACKAGE_ROOT_FILE && !expectedPaths.has(path)) {
        blockers.push(`Unexpected file ${path} is not declared in package.yaml`);
      }
    }

    for (const collection of descriptor.types) {
      this.parseCollectionEntries(collection, textEntries, packageHashInputs, entries);
    }

    for (const collection of descriptor.manualTypes) {
      this.parseCollectionEntries(collection, textEntries, packageHashInputs, entries);
    }

    return {
      descriptor,
      entries,
      warnings,
      blockers: uniqueStrings(blockers),
      packageHash: hashPathTextMap(packageHashInputs),
    };
  }

  private parseCollectionEntries(
    collection: MetadataTypeMembersDescriptor,
    textEntries: Map<string, string>,
    packageHashInputs: Map<string, string>,
    entries: ParsedPackageEntry[],
  ): void {
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

      const normalizedEntryData = this.entryNormalizer.normalizeEntryForComparison(
        typeName,
        member,
        parsedValue,
      );
      entry.member = this.entryNormalizer.getNormalizedMetadataMember(typeName, member, normalizedEntryData);
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
}

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

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}
