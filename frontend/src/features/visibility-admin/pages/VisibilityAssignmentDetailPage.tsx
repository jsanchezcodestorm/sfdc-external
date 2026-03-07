import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deleteVisibilityAssignment,
  fetchVisibilityAssignment,
  fetchVisibilityAssignments,
  fetchVisibilityCones,
} from '../visibility-admin-api'
import { DetailBlock, DetailMetric, ToneBadge } from '../components/VisibilityAdminPrimitives'
import type {
  VisibilityAssignmentDetailResponse,
  VisibilityAssignmentSummary,
  VisibilityConeSummary,
} from '../visibility-admin-types'
import {
  buildVisibilityAssignmentEditPath,
  buildVisibilityAssignmentsListPath,
  buildVisibilityConeViewPath,
  formatVisibilityDateTime,
} from '../visibility-admin-utils'

type RouteParams = {
  assignmentId?: string
}

export function VisibilityAssignmentDetailPage() {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const assignmentId = params.assignmentId ? decodeURIComponent(params.assignmentId) : null
  const [payload, setPayload] = useState<VisibilityAssignmentDetailResponse | null>(null)
  const [cones, setCones] = useState<VisibilityConeSummary[]>([])
  const [summaries, setSummaries] = useState<VisibilityAssignmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!assignmentId) {
      setLoading(false)
      setPageError('Assignment ID mancante')
      return
    }

    let cancelled = false
    setLoading(true)

    void Promise.all([
      fetchVisibilityAssignment(assignmentId),
      fetchVisibilityCones(),
      fetchVisibilityAssignments(),
    ])
      .then(([assignmentPayload, conesPayload, assignmentsPayload]) => {
        if (cancelled) {
          return
        }

        setPayload(assignmentPayload)
        setCones(conesPayload.items ?? [])
        setSummaries(assignmentsPayload.items ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento visibility assignment'
        setPageError(message)
        setPayload(null)
        setCones([])
        setSummaries([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [assignmentId])

  const selectedCone = useMemo(
    () => cones.find((cone) => cone.id === payload?.assignment.coneId) ?? null,
    [cones, payload],
  )
  const selectedSummary = useMemo(
    () => summaries.find((entry) => entry.id === assignmentId) ?? null,
    [assignmentId, summaries],
  )

  const removeAssignment = async () => {
    if (!assignmentId || !window.confirm(`Eliminare l'assignment ${assignmentId}?`)) {
      return
    }

    setDeleting(true)
    setPageError(null)

    try {
      await deleteVisibilityAssignment(assignmentId)
      navigate(buildVisibilityAssignmentsListPath(), { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore eliminazione visibility assignment'
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
            {selectedCone?.code || 'Visibility assignment'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(buildVisibilityAssignmentsListPath())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista assignments
          </button>
          {assignmentId ? (
            <button
              type="button"
              onClick={() => navigate(buildVisibilityAssignmentEditPath(assignmentId))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Modifica
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void removeAssignment()
            }}
            disabled={!assignmentId || deleting}
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
        <p className="mt-4 text-sm text-slate-600">Caricamento visibility assignment...</p>
      ) : payload ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailMetric
              label="Current Status"
              value={selectedSummary?.isCurrentlyApplicable ? 'Applicable' : 'Inactive'}
            />
            <DetailMetric
              label="Selectors"
              value={String(
                [
                  payload.assignment.contactId,
                  payload.assignment.permissionCode,
                  payload.assignment.recordType,
                ].filter(Boolean).length,
              )}
            />
            <DetailMetric
              label="Validity Window"
              value={payload.assignment.validFrom || payload.assignment.validTo ? 'Custom' : 'Always'}
            />
          </div>

          <DetailBlock label="Cone">
            {selectedCone ? (
              <Link
                to={buildVisibilityConeViewPath(selectedCone.id)}
                className="font-medium text-sky-700 underline-offset-2 hover:underline"
              >
                {selectedCone.code}
              </Link>
            ) : (
              <span className="text-slate-700">{payload.assignment.coneId}</span>
            )}
          </DetailBlock>
          <DetailBlock label="Selectors">
            <div className="flex flex-wrap gap-2">
              {payload.assignment.contactId ? (
                <ToneBadge tone="sky">{payload.assignment.contactId}</ToneBadge>
              ) : null}
              {payload.assignment.permissionCode ? (
                <ToneBadge tone="green">{payload.assignment.permissionCode}</ToneBadge>
              ) : null}
              {payload.assignment.recordType ? (
                <ToneBadge tone="amber">{payload.assignment.recordType}</ToneBadge>
              ) : null}
              {!payload.assignment.contactId &&
              !payload.assignment.permissionCode &&
              !payload.assignment.recordType ? (
                <span className="text-sm text-slate-700">Nessun selettore impostato.</span>
              ) : null}
            </div>
          </DetailBlock>
          <DetailBlock label="Validity Window">
            <div className="space-y-2 text-sm text-slate-700">
              <p>Valid from: {formatVisibilityDateTime(payload.assignment.validFrom)}</p>
              <p>Valid to: {formatVisibilityDateTime(payload.assignment.validTo)}</p>
            </div>
          </DetailBlock>
          <DetailBlock label="Applicability">
            <ToneBadge tone={selectedSummary?.isCurrentlyApplicable ? 'green' : 'amber'}>
              {selectedSummary?.isCurrentlyApplicable ? 'Currently applicable' : 'Currently inactive'}
            </ToneBadge>
          </DetailBlock>
        </div>
      ) : null}
    </section>
  )
}

