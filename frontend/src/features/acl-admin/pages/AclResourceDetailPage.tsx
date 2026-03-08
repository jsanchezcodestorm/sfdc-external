import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppDialog } from '../../../components/app-dialog'
import { deleteAclResource, fetchAclResource } from '../acl-admin-api'
import type { AclAdminResourceResponse } from '../acl-admin-types'

type RouteParams = {
  resourceId?: string
}

export function AclResourceDetailPage() {
  const { confirm } = useAppDialog()
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const resourceId = params.resourceId ? decodeURIComponent(params.resourceId) : null
  const [payload, setPayload] = useState<AclAdminResourceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!resourceId) {
      setLoading(false)
      setPageError('Resource id mancante')
      return
    }

    let cancelled = false
    setLoading(true)

    void fetchAclResource(resourceId)
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

        const message = error instanceof Error ? error.message : 'Errore caricamento resource'
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
  }, [resourceId])

  const removeResource = async () => {
    if (!resourceId) {
      return
    }

    const confirmed = await confirm({
      title: 'Elimina risorsa',
      description: `Eliminare la risorsa ${resourceId}?`,
      confirmLabel: 'Elimina',
      cancelLabel: 'Annulla',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    setDeleting(true)
    setPageError(null)

    try {
      await deleteAclResource(resourceId)
      navigate('/admin/acl/resources', { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore eliminazione resource'
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
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{resourceId || 'Resource'}</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/acl/resources')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista resources
          </button>
          {resourceId ? (
            <button
              type="button"
              onClick={() => navigate(`/admin/acl/resources/${encodeURIComponent(resourceId)}/edit`)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Modifica
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void removeResource()
            }}
            disabled={!resourceId || deleting}
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
        <p className="mt-4 text-sm text-slate-600">Caricamento resource...</p>
      ) : payload ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailMetric label="Type" value={payload.resource.type} />
            <DetailMetric label="Permissions" value={String(payload.resource.permissions.length)} />
            <DetailMetric label="Target" value={payload.resource.target ? 'Configurato' : 'Assente'} />
          </div>

          <DetailBlock label="Target">{payload.resource.target || '-'}</DetailBlock>
          <DetailBlock label="Description">{payload.resource.description || '-'}</DetailBlock>
          <DetailBlock label="Permissions">
            {payload.resource.permissions.length > 0
              ? payload.resource.permissions.join(', ')
              : '-'}
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
