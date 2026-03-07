import { BadRequestException } from '@nestjs/common';

import type { AclConfigSnapshot, AclPermissionDefinition, AclResourceConfig, AclResourceType } from './acl.types';

const CANONICAL_PERMISSION_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const RESOURCE_ID_PATTERN = /^(rest|entity|query|route):([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const RESOURCE_TYPES: ReadonlySet<AclResourceType> = new Set(['rest', 'entity', 'query', 'route']);

export function normalizeAclConfigSnapshot(value: unknown): AclConfigSnapshot {
  const snapshot = requireObject(value, 'ACL config snapshot must be an object');
  const permissions = requireArray(snapshot.permissions, 'permissions must be an array').map((entry, index) =>
    normalizeAclPermissionDefinitionInput(entry, `permissions[${index}]`)
  );
  const defaultPermissions = requireArray(
    snapshot.defaultPermissions,
    'defaultPermissions must be an array'
  ).map((entry, index) => normalizeCanonicalPermissionCode(entry, `defaultPermissions[${index}]`));
  const resources = requireArray(snapshot.resources, 'resources must be an array').map((entry, index) =>
    normalizeAclResourceConfigInput(entry, `resources[${index}]`)
  );

  validateSnapshotConsistency({ permissions, defaultPermissions, resources });

  return {
    permissions,
    defaultPermissions,
    resources
  };
}

export function normalizeCanonicalPermissionCode(value: unknown, fieldName: string): string {
  const code = requireString(value, `${fieldName} must be a non-empty string`);

  if (!CANONICAL_PERMISSION_CODE_PATTERN.test(code)) {
    throw new BadRequestException(`${fieldName} must use canonical format (e.g. PORTAL_ADMIN)`);
  }

  return code;
}

export function normalizeAclPermissionDefinitionInput(
  value: unknown,
  fieldName = 'permission'
): AclPermissionDefinition {
  const permission = requireObject(value, `${fieldName} must be an object`);
  const code = normalizeCanonicalPermissionCode(permission.code, `${fieldName}.code`);
  const aliases = permission.aliases === undefined
    ? []
    : requireArray(permission.aliases, `${fieldName}.aliases must be an array`).map((entry, aliasIndex) =>
        normalizeCanonicalPermissionCode(entry, `${fieldName}.aliases[${aliasIndex}]`)
      );

  return {
    code,
    label: asOptionalString(permission.label),
    description: asOptionalString(permission.description),
    aliases
  };
}

export function normalizeAclResourceConfigInput(
  value: unknown,
  fieldName = 'resource'
): AclResourceConfig {
  const resource = requireObject(value, `${fieldName} must be an object`);
  const type = normalizeResourceType(resource.type, `${fieldName}.type`);
  const id = requireString(resource.id, `${fieldName}.id must be a non-empty string`);
  const permissions = requireArray(resource.permissions, `${fieldName}.permissions must be an array`).map(
    (entry, permissionIndex) =>
      normalizeCanonicalPermissionCode(entry, `${fieldName}.permissions[${permissionIndex}]`)
  );

  validateResourceId(id, type, `${fieldName}.id`);

  return {
    id,
    type,
    target: asOptionalString(resource.target),
    description: asOptionalString(resource.description),
    permissions
  };
}

function normalizeResourceType(value: unknown, fieldName: string): AclResourceType {
  const normalized = requireString(value, `${fieldName} must be a non-empty string`).toLowerCase() as AclResourceType;

  if (!RESOURCE_TYPES.has(normalized)) {
    throw new BadRequestException(`${fieldName} must be one of rest, entity, query, route`);
  }

  return normalized;
}

function validateSnapshotConsistency(snapshot: AclConfigSnapshot): void {
  const permissionCodes = new Set<string>();
  const aliasOwners = new Map<string, string>();

  for (const permission of snapshot.permissions) {
    if (permissionCodes.has(permission.code)) {
      throw new BadRequestException(`Duplicate permission code ${permission.code}`);
    }

    permissionCodes.add(permission.code);

    for (const alias of permission.aliases ?? []) {
      if (permissionCodes.has(alias)) {
        throw new BadRequestException(`Alias ${alias} collides with an existing permission code`);
      }

      const existingOwner = aliasOwners.get(alias);
      if (existingOwner && existingOwner !== permission.code) {
        throw new BadRequestException(`Alias ${alias} is already assigned to ${existingOwner}`);
      }

      if (existingOwner === permission.code) {
        throw new BadRequestException(`Duplicate alias ${alias} for permission ${permission.code}`);
      }

      aliasOwners.set(alias, permission.code);
    }
  }

  const defaultPermissions = new Set<string>();
  for (const code of snapshot.defaultPermissions) {
    if (!permissionCodes.has(code)) {
      throw new BadRequestException(`Default permission ${code} is not defined in the permission catalog`);
    }

    if (defaultPermissions.has(code)) {
      throw new BadRequestException(`Duplicate default permission ${code}`);
    }

    defaultPermissions.add(code);
  }

  const resourceIds = new Set<string>();
  for (const resource of snapshot.resources) {
    if (resourceIds.has(resource.id)) {
      throw new BadRequestException(`Duplicate ACL resource ${resource.id}`);
    }

    resourceIds.add(resource.id);

    const resourcePermissions = new Set<string>();
    for (const code of resource.permissions) {
      if (!permissionCodes.has(code)) {
        throw new BadRequestException(`ACL resource ${resource.id} references unknown permission ${code}`);
      }

      if (resourcePermissions.has(code)) {
        throw new BadRequestException(`ACL resource ${resource.id} contains duplicate permission ${code}`);
      }

      resourcePermissions.add(code);
    }
  }
}

function validateResourceId(resourceId: string, type: AclResourceType, fieldName: string): void {
  const match = RESOURCE_ID_PATTERN.exec(resourceId);
  if (!match) {
    throw new BadRequestException(`${fieldName} must use the format <type>:<lowercase-kebab-case-id>`);
  }

  if (match[1] !== type) {
    throw new BadRequestException(`${fieldName} prefix must match resource type ${type}`);
  }
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new BadRequestException(message);
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(message);
  }

  return value;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(message);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new BadRequestException(message);
  }

  return normalized;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
