import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { dump as dumpYaml } from 'js-yaml';

import type {
  DeployableMetadataTypeName,
  MetadataPackageDescriptor,
  MetadataPreviewItem,
  MetadataSectionName,
  MetadataTypeMembersDescriptor,
  MetadataTypeName,
} from '../metadata.types';
import {
  METADATA_CONTACT_MAPPING,
  METADATA_DEPLOY_MODE,
  METADATA_PACKAGE_FORMAT,
  METADATA_PACKAGE_VERSION,
  METADATA_SECRET_POLICY,
} from '../metadata.types';

export type MetadataCategory = 'deployable' | 'manual';

export type MetadataTypeDefinition = {
  category: MetadataCategory;
  section: MetadataSectionName;
  pathFromMember: (member: string) => string;
};

export type ExportEntry = {
  member: string;
  data: unknown;
};

export const PACKAGE_ROOT_FILE = 'package.yaml';
export const FINGERPRINT_ABSENT = '__ABSENT__';
export const FINGERPRINT_UNAVAILABLE = '__UNAVAILABLE__';
export const MANUAL_AUTH_PROVIDER_REASON =
  'Manual step: re-enter the provider secret and verify callback settings in the target environment.';
export const MANUAL_LOCAL_CREDENTIAL_REASON =
  'Manual step: recreate or reset the local password in the target environment.';

export const TYPE_ORDER: MetadataTypeName[] = [
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

export const DEPLOYABLE_TYPE_ORDER: DeployableMetadataTypeName[] = TYPE_ORDER.filter((typeName) =>
  !['AuthProvider', 'LocalCredential'].includes(typeName)
) as DeployableMetadataTypeName[];

export const TYPE_DEFINITIONS: Record<MetadataTypeName, MetadataTypeDefinition> = {
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

export const SECTION_TO_TYPES: Record<MetadataSectionName, MetadataTypeName[]> = {
  entities: ['EntityConfig'],
  apps: ['AppConfig'],
  acl: ['AclPermission', 'AclResource', 'AclDefaultPermission'],
  aclContactPermissions: ['AclContactPermission'],
  queryTemplates: ['QueryTemplate'],
  visibility: ['VisibilityCone', 'VisibilityRule', 'VisibilityAssignment'],
  authProviders: ['AuthProvider'],
  localCredentials: ['LocalCredential'],
};

export function getTypeDefinition(typeName: string): MetadataTypeDefinition {
  const definition = TYPE_DEFINITIONS[typeName as MetadataTypeName];
  if (!definition) {
    throw new BadRequestException(`Unsupported metadata type ${typeName}`);
  }

  return definition;
}

export function buildPackageDescriptor(
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

export function comparePreviewItems(left: MetadataPreviewItem, right: MetadataPreviewItem): number {
  const leftTypeOrder = TYPE_ORDER.indexOf(left.typeName);
  const rightTypeOrder = TYPE_ORDER.indexOf(right.typeName);
  if (leftTypeOrder !== rightTypeOrder) {
    return leftTypeOrder - rightTypeOrder;
  }

  return left.path.localeCompare(right.path);
}

export function zipFiles(files: Map<string, string>): Buffer {
  const payload: Record<string, Uint8Array> = {};
  for (const path of [...files.keys()].sort((left, right) => left.localeCompare(right))) {
    payload[path] = strToU8(files.get(path) ?? '');
  }

  return Buffer.from(zipSync(payload));
}

export function unzipTextEntries(buffer: Buffer): Map<string, string> {
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

export function hashPathTextMap(values: Map<string, string>): string {
  const hasher = createHash('sha256');
  for (const path of [...values.keys()].sort((left, right) => left.localeCompare(right))) {
    hasher.update(path, 'utf8');
    hasher.update('\n', 'utf8');
    hasher.update(values.get(path) ?? '', 'utf8');
    hasher.update('\n---\n', 'utf8');
  }

  return hasher.digest('hex');
}

export function renderYamlDocument(value: unknown): string {
  const yaml = dumpYaml(canonicalizeValue(value), {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });

  return normalizeMultilineText(yaml.endsWith('\n') ? yaml : `${yaml}\n`);
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function canonicalizeValue(value: unknown): unknown {
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

export function normalizeMultilineText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException(message);
  }

  return value;
}

export function requireNestedObject(
  value: unknown,
  fieldName: string,
  context: string,
): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value[fieldName])) {
    throw new BadRequestException(`${context} ${fieldName} is required`);
  }

  return value[fieldName] as Record<string, unknown>;
}

export function requireStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${context} must be an array`);
  }

  return value.map((entry, index) => requireNonEmptyString(entry, `${context}[${index}]`));
}

export function requireNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${context} must be a non-empty string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(`${context} must be a non-empty string`);
  }

  return normalized;
}

export function requireString(value: unknown, errorMessage: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(errorMessage);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(errorMessage);
  }

  return normalized;
}

export function normalizeEmail(value: unknown, errorMessage: string): string {
  const normalized = requireString(value, errorMessage).toLowerCase();
  if (!normalized.includes('@')) {
    throw new BadRequestException(errorMessage);
  }
  return normalized;
}

export function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
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
