import type { AclPermissionDefinition, AclResourceConfig, AclResourceType } from './acl-admin-types'

export const ACL_RESOURCE_TYPE_OPTIONS: Array<{ value: AclResourceType; label: string }> = [
  { value: 'rest', label: 'REST' },
  { value: 'entity', label: 'Entity' },
  { value: 'query', label: 'Query' },
  { value: 'route', label: 'Route' },
]

export function createEmptyPermission(): AclPermissionDefinition {
  return {
    code: '',
    label: '',
    description: '',
    aliases: [],
  }
}

export function createEmptyResource(): AclResourceConfig {
  return {
    id: '',
    type: 'rest',
    target: '',
    description: '',
    permissions: [],
  }
}

export function normalizePermission(permission: AclPermissionDefinition): AclPermissionDefinition {
  const aliases = uniqueValues(
    (permission.aliases ?? []).map((alias) => alias.trim()).filter((alias) => alias.length > 0),
  )

  return {
    code: permission.code.trim(),
    label: permission.label?.trim() || undefined,
    description: permission.description?.trim() || undefined,
    aliases,
  }
}

export function normalizeResource(resource: AclResourceConfig): AclResourceConfig {
  return {
    id: resource.id.trim(),
    type: resource.type,
    target: resource.target?.trim() || undefined,
    description: resource.description?.trim() || undefined,
    permissions: uniqueValues(resource.permissions.map((permission) => permission.trim())),
  }
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)]
}
