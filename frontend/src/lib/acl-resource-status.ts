export type AclResourceAccessMode = 'disabled' | 'authenticated' | 'permission-bound'
export type AclResourceManagedBy = 'manual' | 'system'
export type AclResourceSyncState = 'present' | 'stale'

export type AclResourceStatus = {
  id: string
  accessMode: AclResourceAccessMode
  managedBy: AclResourceManagedBy
  syncState: AclResourceSyncState
}

export function formatAclResourceAccessMode(value: AclResourceAccessMode): string {
  switch (value) {
    case 'disabled':
      return 'Disabilitata'
    case 'authenticated':
      return 'Autenticata'
    case 'permission-bound':
      return 'Permission-bound'
  }
}

export function formatAclResourceManagedBy(value: AclResourceManagedBy): string {
  switch (value) {
    case 'manual':
      return 'Manual'
    case 'system':
      return 'System'
  }
}

export function formatAclResourceSyncState(value: AclResourceSyncState): string {
  switch (value) {
    case 'present':
      return 'Present'
    case 'stale':
      return 'Stale'
  }
}

export function describeAclResourceStatus(status: AclResourceStatus): string {
  if (status.syncState === 'stale') {
    return 'La sorgente non esiste piu e la risorsa resta negata finche non viene riallineata.'
  }

  switch (status.accessMode) {
    case 'disabled':
      return 'La risorsa esiste ma resta fail-closed finche un admin non la attiva.'
    case 'authenticated':
      return 'La risorsa e disponibile a ogni sessione autenticata.'
    case 'permission-bound':
      return 'La risorsa richiede almeno una ACL permission associata.'
  }
}

export function isAclResourceOperational(status: AclResourceStatus): boolean {
  return status.syncState === 'present' && status.accessMode !== 'disabled'
}
