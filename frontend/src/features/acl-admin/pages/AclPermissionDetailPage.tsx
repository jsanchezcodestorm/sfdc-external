import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { deleteAclPermission, fetchAclPermission } from '../acl-admin-api'
import type { AclAdminPermissionResponse } from '../acl-admin-types'

type RouteParams = {
  permissionCode?: string
}

export function AclPermissionDetailPage() {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const permissionCode = params.permissionCode ? decodeURIComponent(params.permissionCode) : null
  const [payload, setPayload] = useState<AclAdminPermissionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!permissionCode) {
      setLoading(false)
      setPageError('Permission code mancante')
      return
    }

    let cancelled = false
    setLoading(true)

    void fetchAclPermission(permissionCode)
      .then((response) => {
        if (cancelled) {
          return
        }

        setPayload(response)
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento permission'
        setPageError(message)
        setPayload(null)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [permissionCode])

  const removePermission = async () => {
    if (!permissionCode || !window.confirm(`Eliminare il permesso ${permissionCode}?`)) {
      return
    }

    setDeleting(true)
    setPageError(null)

    try {
      await deleteAclPermission(permissionCode)
      navigate('/admin/acl/permissions', { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore eliminazione permission'
      setPageError(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            View
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {permissionCode || 'Permission'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/acl/permissions')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista permissions
          </button>
          {permissionCode ? (
            <button
              type="button"
              onClick={() => navigate(`/admin/acl/permissions/${encodeURIComponent(permissionCode)}/edit`)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Modifica
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void removePermission()
            }}
            disabled={!permissionCode || deleting}
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {deleting ? 'Eliminazione...' : 'Elimina'}
          </button>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento permission...</p>
      ) : payload ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailMetric label="Default" value={payload.isDefault ? 'Si' : 'No'} />
            <DetailMetric label="Aliases" value={String(payload.permission.aliases.length)} />
            <DetailMetric label="Resources" value={String(payload.resourceCount)} />
          </div>

          <DetailBlock label="Label">{payload.permission.label || '-'}</DetailBlock>
          <DetailBlock label="Description">{payload.permission.description || '-'}</DetailBlock>
          <DetailBlock label="Aliases">
            {payload.permission.aliases.length > 0 ? payload.permission.aliases.join(', ') : '-'}
          </DetailBlock>
          <DetailBlock label="Resource Ids">
            {payload.resourceIds.length > 0 ? payload.resourceIds.join(', ') : '-'}
          </DetailBlock>
        </div>
      ) : null}
    </section>
  )
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </article>
  )
}

function DetailBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm text-slate-700">{children}</p>
    </div>
  )
}
