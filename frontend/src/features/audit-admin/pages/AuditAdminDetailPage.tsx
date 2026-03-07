import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import {
  fetchApplicationAuditDetail,
  fetchQueryAuditDetail,
  fetchSecurityAuditDetail,
  fetchVisibilityAuditDetail,
} from '../audit-admin-api'
import type {
  ApplicationAuditDetail,
  QueryAuditDetail,
  SecurityAuditDetail,
  VisibilityAuditDetail,
} from '../audit-admin-types'
import {
  AUDIT_TAB_COPY,
  buildAuditListPath,
  buildAuditSearch,
  isAuditStream,
} from '../audit-admin-utils'

type AuditDetail = SecurityAuditDetail | VisibilityAuditDetail | ApplicationAuditDetail | QueryAuditDetail

type RouteParams = {
  stream?: string
  auditId?: string
}

export function AuditAdminDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<RouteParams>()
  const [detail, setDetail] = useState<AuditDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  const stream = isAuditStream(params.stream) ? params.stream : null
  const auditId = params.auditId ? decodeURIComponent(params.auditId) : null

  useEffect(() => {
    if (!stream) {
      setDetail(null)
      setLoading(false)
      setPageError('Stream audit non valido')
      return
    }

    if (!auditId) {
      setDetail(null)
      setLoading(false)
      setPageError('Audit ID mancante')
      return
    }

    let cancelled = false
    setLoading(true)
    setPageError(null)

    const load = async () => {
      try {
        if (stream === 'security') {
          const payload = await fetchSecurityAuditDetail(auditId)
          if (!cancelled) {
            setDetail(payload)
            setPageError(null)
          }
          return
        }

        if (stream === 'visibility') {
          const payload = await fetchVisibilityAuditDetail(auditId)
          if (!cancelled) {
            setDetail(payload)
            setPageError(null)
          }
          return
        }

        if (stream === 'application') {
          const payload = await fetchApplicationAuditDetail(auditId)
          if (!cancelled) {
            setDetail(payload)
            setPageError(null)
          }
          return
        }

        const payload = await fetchQueryAuditDetail(auditId)
        if (!cancelled) {
          setDetail(payload)
          setPageError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setDetail(null)
          setPageError(error instanceof Error ? error.message : 'Errore caricamento audit')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [auditId, stream])

  const backSearch = useMemo(() => {
    if (!stream) {
      return ''
    }

    return location.search || buildAuditSearch(stream)
  }, [location.search, stream])

  const scalarEntries = useMemo(
    () =>
      detail
        ? Object.entries(detail).filter(
            ([key]) =>
              key !== 'metadata' &&
              key !== 'result' &&
              key !== 'resolvedSoql' &&
              key !== 'baseWhere' &&
              key !== 'finalWhere',
          )
        : [],
    [detail],
  )

  return (
    <section className="flex w-full flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">View</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {stream ? AUDIT_TAB_COPY[stream].title : 'Audit'} event
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Pagina read-only dedicata al dettaglio completo dell&apos;evento audit selezionato.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Evento
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{auditId || 'Audit'}</h2>
            {stream ? (
              <p className="mt-1 text-sm text-slate-600">{AUDIT_TAB_COPY[stream].description}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                navigate({
                  pathname: buildAuditListPath(),
                  search: backSearch,
                })
              }
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Lista audit
            </button>
          </div>
        </div>

        {pageError ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {pageError}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Caricamento dettaglio audit...</p>
        ) : detail ? (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {scalarEntries.map(([key, value]) => (
                <DetailMetric key={key} label={key} value={formatDetailValue(key, value)} />
              ))}
            </div>

            {'metadata' in detail ? (
              <DetailBlock label="Metadata">
                <JsonPreview value={detail.metadata} />
              </DetailBlock>
            ) : null}

            {'result' in detail ? (
              <DetailBlock label="Result">
                <JsonPreview value={detail.result} />
              </DetailBlock>
            ) : null}

            {'resolvedSoql' in detail ? (
              <DetailBlock label="Resolved SOQL">
                <QueryTextPreview value={detail.resolvedSoql} />
              </DetailBlock>
            ) : null}

            {'baseWhere' in detail ? (
              <DetailBlock label="Base WHERE">
                <QueryTextPreview value={detail.baseWhere} />
              </DetailBlock>
            ) : null}

            {'finalWhere' in detail ? (
              <DetailBlock label="Final WHERE">
                <QueryTextPreview value={detail.finalWhere} />
              </DetailBlock>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  )
}

function formatDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '-'
  }

  if (typeof value === 'string' && key.toLowerCase().endsWith('at')) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString()
    }
  }

  return String(value)
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 break-all text-sm font-semibold text-slate-950">{value}</p>
    </article>
  )
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  )
}

function QueryTextPreview({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
      {value.trim().length > 0 ? value : '-'}
    </pre>
  )
}
