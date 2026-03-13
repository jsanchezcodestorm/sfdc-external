import { Link } from 'react-router-dom'

import {
  describeAclResourceStatus,
  type AclResourceStatus,
} from '../lib/acl-resource-status'

type AclResourceStatusNoticeProps = {
  status: AclResourceStatus
  permissionCount?: number
  className?: string
}

export function AclResourceStatusNotice({
  status,
  permissionCount,
  className = 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800',
}: AclResourceStatusNoticeProps) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="sm:pr-4">
          <code className="font-mono">{status.id}</code> - {describeAclResourceStatusWithPermissions(status, permissionCount)}
        </p>

        <Link
          to={buildAclNoticeTarget(status, permissionCount)}
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
        >
          {getAclNoticeCtaLabel(status, permissionCount)}
        </Link>
      </div>
    </div>
  )
}

function describeAclResourceStatusWithPermissions(
  status: AclResourceStatus,
  permissionCount: number | undefined,
): string {
  if (status.accessMode === 'permission-bound' && (permissionCount ?? 0) > 0) {
    return 'La risorsa e attiva ed e visibile solo ai profili con una ACL permission associata.'
  }

  return describeAclResourceStatus(status)
}

function getAclNoticeCtaLabel(status: AclResourceStatus, permissionCount: number | undefined): string {
  if (status.syncState === 'stale') {
    return 'Verifica risorsa ACL'
  }

  if (status.accessMode === 'permission-bound' && (permissionCount ?? 0) > 0) {
    return 'Gestisci ACL'
  }

  if (status.accessMode === 'permission-bound') {
    return 'Aggiungi ACL'
  }

  return 'Configura ACL'
}

function buildAclNoticeTarget(status: AclResourceStatus, permissionCount: number | undefined): string {
  const encodedId = encodeURIComponent(status.id)

  if (status.syncState === 'stale') {
    return `/admin/acl/resources/${encodedId}`
  }

  if (status.accessMode === 'permission-bound' && (permissionCount ?? 0) > 0) {
    return `/admin/acl/resources/${encodedId}/edit#resource-permissions`
  }

  return `/admin/acl/resources/${encodedId}/edit#resource-permissions`
}
