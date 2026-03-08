import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppDialog } from '../../../components/app-dialog'
import {
  deleteQueryTemplateAdmin,
  fetchQueryTemplateAdmin,
} from '../query-template-admin-api'
import type { QueryTemplateAdminResponse } from '../query-template-admin-types'
import {
  buildQueryTemplateEditPath,
  buildQueryTemplateListPath,
} from '../query-template-admin-utils'

type RouteParams = {
  templateId?: string
}

export function QueryTemplateDetailPage() {
  const { confirm } = useAppDialog()
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const templateId = params.templateId ? decodeURIComponent(params.templateId) : null
  const [payload, setPayload] = useState<QueryTemplateAdminResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!templateId) {
      setLoading(false)
      setPageError('Template ID mancante')
      return
    }

    let cancelled = false
    setLoading(true)

    void fetchQueryTemplateAdmin(templateId)
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

        const message =
          error instanceof Error ? error.message : 'Errore caricamento query template'
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
  }, [templateId])

  const defaultParamsEntries = useMemo(
    () => Object.entries(payload?.template.defaultParams ?? {}),
    [payload],
  )

  const removeTemplate = async () => {
    if (!templateId) {
      return
    }

    const confirmed = await confirm({
      title: 'Elimina template',
      description: `Eliminare il template ${templateId}?`,
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
      await deleteQueryTemplateAdmin(templateId)
      navigate(buildQueryTemplateListPath(), { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore eliminazione query template'
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
            {templateId || 'Query template'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(buildQueryTemplateListPath())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista template
          </button>
          {templateId ? (
            <button
              type="button"
              onClick={() => navigate(buildQueryTemplateEditPath(templateId))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Modifica
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void removeTemplate()
            }}
            disabled={!templateId || deleting}
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
        <p className="mt-4 text-sm text-slate-600">Caricamento query template...</p>
      ) : payload ? (
        <div className="mt-5 space-y-5">
          {!payload.aclResourceConfigured ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Risorsa ACL mancante: <code className="font-mono">query:{payload.template.id}</code>.
              Configurala nel modulo ACL Admin per autorizzare l'uso del template.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <DetailMetric
              label="ACL"
              value={payload.aclResourceConfigured ? 'Configurata' : 'Mancante'}
            />
            <DetailMetric
              label="Max Limit"
              value={payload.template.maxLimit ? String(payload.template.maxLimit) : '-'}
            />
            <DetailMetric
              label="Default Params"
              value={String(defaultParamsEntries.length)}
            />
          </div>

          <DetailBlock label="Object API Name">{payload.template.objectApiName}</DetailBlock>
          <DetailBlock label="Description">{payload.template.description || '-'}</DetailBlock>
          <DetailBlock label="SOQL" preformatted>
            {payload.template.soql}
          </DetailBlock>
          <DetailBlock label="Default Params">
            {defaultParamsEntries.length > 0 ? (
              <div className="space-y-2">
                {defaultParamsEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      {key}
                    </span>
                    <span className="text-sm text-slate-700">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-700">Nessun parametro di default configurato.</p>
            )}
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

function DetailBlock({
  label,
  children,
  preformatted = false,
}: {
  label: string
  children: React.ReactNode
  preformatted?: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      {preformatted ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">
          {children}
        </pre>
      ) : (
        <div className="mt-3 text-sm text-slate-700">{children}</div>
      )}
    </div>
  )
}
