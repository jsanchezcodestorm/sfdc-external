import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAppDialog } from '../../../components/app-dialog'
import {
  deleteVisibilityRule,
  fetchVisibilityCones,
  fetchVisibilityRule,
} from '../visibility-admin-api'
import { DetailBlock, DetailMetric, ToneBadge } from '../components/VisibilityAdminPrimitives'
import { VisibilityRuleTreePreview } from '../components/VisibilityRuleTreePreview'
import type { VisibilityConeSummary, VisibilityRuleDetailResponse } from '../visibility-admin-types'
import {
  buildVisibilityConeViewPath,
  buildVisibilityRuleEditPath,
  buildVisibilityRulesListPath,
} from '../visibility-admin-utils'

type RouteParams = {
  ruleId?: string
}

export function VisibilityRuleDetailPage() {
  const { confirm } = useAppDialog()
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const ruleId = params.ruleId ? decodeURIComponent(params.ruleId) : null
  const [payload, setPayload] = useState<VisibilityRuleDetailResponse | null>(null)
  const [cones, setCones] = useState<VisibilityConeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!ruleId) {
      setLoading(false)
      setPageError('Rule ID mancante')
      return
    }

    let cancelled = false
    setLoading(true)

    void Promise.all([fetchVisibilityRule(ruleId), fetchVisibilityCones()])
      .then(([rulePayload, conesPayload]) => {
        if (cancelled) {
          return
        }

        setPayload(rulePayload)
        setCones(conesPayload.items ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento visibility rule'
        setPageError(message)
        setPayload(null)
        setCones([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [ruleId])

  const selectedCone = useMemo(
    () => cones.find((cone) => cone.id === payload?.rule.coneId) ?? null,
    [cones, payload],
  )

  const removeRule = async () => {
    if (!ruleId) {
      return
    }

    const confirmed = await confirm({
      title: 'Elimina rule',
      description: `Eliminare la rule ${ruleId}?`,
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
      await deleteVisibilityRule(ruleId)
      navigate(buildVisibilityRulesListPath(), { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore eliminazione visibility rule'
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
            {payload?.rule.objectApiName || 'Visibility rule'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(buildVisibilityRulesListPath())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista rules
          </button>
          {selectedCone ? (
            <button
              type="button"
              onClick={() => navigate(buildVisibilityConeViewPath(selectedCone.id))}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-medium text-sky-800 transition hover:border-sky-400 hover:bg-sky-50"
            >
              Apri cone
            </button>
          ) : null}
          {ruleId ? (
            <button
              type="button"
              onClick={() => navigate(buildVisibilityRuleEditPath(ruleId))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Modifica
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void removeRule()
            }}
            disabled={!ruleId || deleting}
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
        <p className="mt-4 text-sm text-slate-600">Caricamento visibility rule...</p>
      ) : payload ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <DetailMetric label="Effect" value={payload.rule.effect} />
            <DetailMetric label="Active" value={payload.rule.active ? 'Yes' : 'No'} />
            <DetailMetric
              label="Fields Allowed"
              value={String(payload.rule.fieldsAllowed?.length ?? 0)}
            />
            <DetailMetric
              label="Fields Denied"
              value={String(payload.rule.fieldsDenied?.length ?? 0)}
            />
          </div>

          <DetailBlock label="Cone">
            {selectedCone ? (
              <div className="space-y-1">
                <Link
                  to={buildVisibilityConeViewPath(selectedCone.id)}
                  className="font-semibold text-sky-700 underline-offset-2 hover:underline"
                >
                  {selectedCone.code}
                </Link>
                <p className="text-sm text-slate-500">{selectedCone.name}</p>
              </div>
            ) : (
              <code className="font-mono text-xs text-slate-800">{payload.rule.coneId}</code>
            )}
          </DetailBlock>
          <DetailBlock label="Object API Name">{payload.rule.objectApiName}</DetailBlock>
          <DetailBlock label="Status">
            <div className="flex flex-wrap gap-2">
              <ToneBadge tone={payload.rule.effect === 'ALLOW' ? 'green' : 'rose'}>
                {payload.rule.effect}
              </ToneBadge>
              <ToneBadge tone={payload.rule.active ? 'sky' : 'slate'}>
                {payload.rule.active ? 'Active' : 'Inactive'}
              </ToneBadge>
            </div>
          </DetailBlock>
          <DetailBlock label="Fields Allowed">
            {payload.rule.fieldsAllowed && payload.rule.fieldsAllowed.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {payload.rule.fieldsAllowed.map((field) => (
                  <ToneBadge key={field} tone="green">
                    {field}
                  </ToneBadge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-700">Nessuna whitelist configurata.</p>
            )}
          </DetailBlock>
          <DetailBlock label="Fields Denied">
            {payload.rule.fieldsDenied && payload.rule.fieldsDenied.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {payload.rule.fieldsDenied.map((field) => (
                  <ToneBadge key={field} tone="rose">
                    {field}
                  </ToneBadge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-700">Nessun field deny configurato.</p>
            )}
          </DetailBlock>
          <DetailBlock label="Condition">
            <VisibilityRuleTreePreview node={payload.rule.condition} />
          </DetailBlock>
        </div>
      ) : null}
    </section>
  )
}
