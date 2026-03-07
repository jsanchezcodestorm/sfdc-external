import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deleteVisibilityCone,
  fetchVisibilityAssignments,
  fetchVisibilityCone,
  fetchVisibilityRules,
} from '../visibility-admin-api'
import { DetailBlock, DetailMetric, ToneBadge } from '../components/VisibilityAdminPrimitives'
import type {
  VisibilityAssignmentSummary,
  VisibilityConeDetailResponse,
  VisibilityRuleSummary,
} from '../visibility-admin-types'
import {
  buildVisibilityAssignmentCreatePath,
  buildVisibilityAssignmentsListPath,
  buildVisibilityAssignmentViewPath,
  buildVisibilityConeEditPath,
  buildVisibilityConesListPath,
  buildVisibilityRuleCreatePath,
  buildVisibilityRulesListPath,
  buildVisibilityRuleViewPath,
} from '../visibility-admin-utils'

type RouteParams = {
  coneId?: string
}

export function VisibilityConeDetailPage() {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const coneId = params.coneId ? decodeURIComponent(params.coneId) : null
  const [payload, setPayload] = useState<VisibilityConeDetailResponse | null>(null)
  const [rules, setRules] = useState<VisibilityRuleSummary[]>([])
  const [assignments, setAssignments] = useState<VisibilityAssignmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!coneId) {
      setLoading(false)
      setPageError('Cone ID mancante')
      return
    }

    let cancelled = false
    setLoading(true)

    void Promise.all([
      fetchVisibilityCone(coneId),
      fetchVisibilityRules(),
      fetchVisibilityAssignments(),
    ])
      .then(([conePayload, rulesPayload, assignmentsPayload]) => {
        if (cancelled) {
          return
        }

        setPayload(conePayload)
        setRules(rulesPayload.items ?? [])
        setAssignments(assignmentsPayload.items ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento visibility cone'
        setPageError(message)
        setPayload(null)
        setRules([])
        setAssignments([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [coneId])

  const relatedRules = useMemo(
    () => rules.filter((entry) => entry.coneId === coneId),
    [coneId, rules],
  )
  const relatedAssignments = useMemo(
    () => assignments.filter((entry) => entry.coneId === coneId),
    [assignments, coneId],
  )

  const removeCone = async () => {
    if (!coneId || !window.confirm(`Eliminare il cone ${coneId}?`)) {
      return
    }

    setDeleting(true)
    setPageError(null)

    try {
      await deleteVisibilityCone(coneId)
      navigate(buildVisibilityConesListPath(), { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore eliminazione visibility cone'
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
            {payload?.cone.code || 'Visibility cone'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(buildVisibilityConesListPath())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista cones
          </button>
          {coneId ? (
            <button
              type="button"
              onClick={() => navigate(buildVisibilityConeEditPath(coneId))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Modifica
            </button>
          ) : null}
          {coneId ? (
            <button
              type="button"
              onClick={() => navigate(buildVisibilityRuleCreatePath(coneId))}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Nuova rule
            </button>
          ) : null}
          {coneId ? (
            <button
              type="button"
              onClick={() => navigate(buildVisibilityAssignmentCreatePath(coneId))}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Nuovo assignment
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void removeCone()
            }}
            disabled={!coneId || deleting}
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
        <p className="mt-4 text-sm text-slate-600">Caricamento visibility cone...</p>
      ) : payload ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <DetailMetric label="Priority" value={String(payload.cone.priority)} />
            <DetailMetric label="Rules" value={String(payload.ruleCount)} />
            <DetailMetric label="Assignments" value={String(payload.assignmentCount)} />
            <DetailMetric label="Active" value={payload.cone.active ? 'Yes' : 'No'} />
          </div>

          <DetailBlock label="Code">
            <code className="font-mono text-xs text-slate-800">{payload.cone.code}</code>
          </DetailBlock>
          <DetailBlock label="Name">{payload.cone.name}</DetailBlock>
          <DetailBlock label="Status">
            <ToneBadge tone={payload.cone.active ? 'green' : 'rose'}>
              {payload.cone.active ? 'Active' : 'Inactive'}
            </ToneBadge>
          </DetailBlock>
          <DetailBlock label="Related Rules">
            <div className="flex flex-wrap gap-2">
              {coneId ? (
                <button
                  type="button"
                  onClick={() => navigate(buildVisibilityRuleCreatePath(coneId))}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Nuova rule
                </button>
              ) : null}
              {coneId ? (
                <button
                  type="button"
                  onClick={() => navigate(buildVisibilityRulesListPath(coneId))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Catalogo filtrato
                </button>
              ) : null}
            </div>

            {relatedRules.length > 0 ? (
              <div className="mt-3 space-y-2">
                {relatedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{rule.objectApiName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {rule.effect} · {rule.active ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                    <Link
                      to={buildVisibilityRuleViewPath(rule.id)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      View rule
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <p className="text-sm text-slate-700">Nessuna rule collegata.</p>
                {coneId ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildVisibilityRuleCreatePath(coneId))}
                    className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Crea la prima rule per questo cone
                  </button>
                ) : null}
              </div>
            )}
          </DetailBlock>
          <DetailBlock label="Related Assignments">
            <div className="flex flex-wrap gap-2">
              {coneId ? (
                <button
                  type="button"
                  onClick={() => navigate(buildVisibilityAssignmentCreatePath(coneId))}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Nuovo assignment
                </button>
              ) : null}
              {coneId ? (
                <button
                  type="button"
                  onClick={() => navigate(buildVisibilityAssignmentsListPath(coneId))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Catalogo filtrato
                </button>
              ) : null}
            </div>

            {relatedAssignments.length > 0 ? (
              <div className="mt-3 space-y-2">
                {relatedAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {assignment.contactId || assignment.permissionCode || assignment.recordType || 'Selettore misto'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {assignment.isCurrentlyApplicable ? 'Currently applicable' : 'Currently inactive'}
                      </p>
                    </div>
                    <Link
                      to={buildVisibilityAssignmentViewPath(assignment.id)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      View assignment
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <p className="text-sm text-slate-700">Nessun assignment collegato.</p>
                {coneId ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildVisibilityAssignmentCreatePath(coneId))}
                    className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Crea il primo assignment per questo cone
                  </button>
                ) : null}
              </div>
            )}
          </DetailBlock>
        </div>
      ) : null}
    </section>
  )
}
