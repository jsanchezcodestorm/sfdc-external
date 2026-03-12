import type {
  AclAdminContactPermission,
  AclPermissionDefinition,
  AclResourceConfig,
  AclResourceType,
} from './acl-admin-types'

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
    accessMode: 'disabled',
    managedBy: 'manual',
    syncState: 'present',
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
    accessMode: resource.accessMode,
    managedBy: resource.managedBy,
    syncState: resource.syncState,
    sourceType: resource.sourceType,
    sourceRef: resource.sourceRef?.trim() || undefined,
    target: resource.target?.trim() || undefined,
    description: resource.description?.trim() || undefined,
    permissions: uniqueValues(resource.permissions.map((permission) => permission.trim())),
  }
}

export type AclContactPermissionDraft = {
  contactId: string
  permissionCodes: string[]
}

export function createEmptyContactPermissionDraft(contactId = ''): AclContactPermissionDraft {
  return {
    contactId,
    permissionCodes: [],
  }
}

export function createContactPermissionDraft(
  value: AclAdminContactPermission,
): AclContactPermissionDraft {
  return {
    contactId: value.contactId,
    permissionCodes: [...value.permissionCodes],
  }
}

export function normalizeContactPermissionDraft(
  draft: AclContactPermissionDraft,
): AclContactPermissionDraft {
  return {
    contactId: draft.contactId.trim(),
    permissionCodes: uniqueValues(
      draft.permissionCodes.map((permissionCode) => permissionCode.trim()).filter(Boolean),
    ),
  }
}

export function formatAclDateTime(value?: string): string {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed)
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)]
}
