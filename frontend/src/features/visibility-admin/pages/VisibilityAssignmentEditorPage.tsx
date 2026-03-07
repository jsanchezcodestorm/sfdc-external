import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { fetchAclPermissions } from '../../acl-admin/acl-admin-api'
import {
  createVisibilityAssignment,
  fetchVisibilityAssignment,
  fetchVisibilityCones,
  updateVisibilityAssignment,
} from '../visibility-admin-api'
import type {
  VisibilityAssignment,
  VisibilityConeSummary,
} from '../visibility-admin-types'
import {
  buildVisibilityAssignmentViewPath,
  buildVisibilityAssignmentsListPath,
  buildVisibilityConeViewPath,
  createEmptyVisibilityAssignmentDraft,
  createVisibilityAssignmentDraft,
  parseVisibilityAssignmentDraft,
  type VisibilityAssignmentDraft,
} from '../visibility-admin-utils'

type VisibilityAssignmentEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  assignmentId?: string
}

export function VisibilityAssignmentEditorPage({
  mode,
}: VisibilityAssignmentEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const [searchParams] = useSearchParams()
  const previousAssignmentId = params.assignmentId
    ? decodeURIComponent(params.assignmentId)
    : null
  const prefilledConeId = searchParams.get('coneId')?.trim() ?? ''
  const [draft, setDraft] = useState<VisibilityAssignmentDraft>(
    createEmptyVisibilityAssignmentDraft(),
  )
  const [cones, setCones] = useState<VisibilityConeSummary[]>([])
  const [permissionCodes, setPermissionCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const loadPromise =
      mode === 'edit' && previousAssignmentId
        ? Promise.all([
            fetchVisibilityCones(),
            fetchVisibilityAssignment(previousAssignmentId),
            fetchAclPermissions(),
          ])
        : Promise.all([fetchVisibilityCones(), Promise.resolve(null), fetchAclPermissions()])

    void loadPromise
      .then(([conesPayload, assignmentPayload, permissionsPayload]) => {
        if (cancelled) {
          return
        }

        const coneItems = conesPayload.items ?? []
        const nextPrefilledConeId = coneItems.some((cone) => cone.id === prefilledConeId)
          ? prefilledConeId
          : ''

        setCones(coneItems)
        setPermissionCodes((permissionsPayload.items ?? []).map((entry) => entry.code))

        if (mode === 'edit' && assignmentPayload) {
          setDraft(createVisibilityAssignmentDraft(assignmentPayload.assignment))
        } else {
          setDraft(createEmptyVisibilityAssignmentDraft(nextPrefilledConeId))
        }

        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento visibility assignment'
        setPageError(message)
        setCones([])
        setPermissionCodes([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mode, prefilledConeId, previousAssignmentId])

  const selectedCone = useMemo(
    () => cones.find((cone) => cone.id === draft.coneId) ?? null,
    [cones, draft.coneId],
  )

  const saveAssignment = async () => {
    let parsedAssignment: Omit<VisibilityAssignment, 'id'>

    try {
      parsedAssignment = parseVisibilityAssignmentDraft(draft)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assignment non valido'
      setPageError(message)
      return
    }

    setSaving(true)
    setPageError(null)

    try {
      const payload =
        mode === 'create'
          ? await createVisibilityAssignment(parsedAssignment)
          : await updateVisibilityAssignment(previousAssignmentId ?? '', parsedAssignment)

      navigate(buildVisibilityAssignmentViewPath(payload.assignment.id), { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore salvataggio visibility assignment'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const cancelTarget =
    mode === 'create'
      ? buildVisibilityAssignmentsListPath()
      : buildVisibilityAssignmentViewPath(previousAssignmentId ?? '')

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {mode === 'create' ? 'Create' : 'Edit'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {mode === 'create' ? 'Nuovo visibility assignment' : 'Visibility assignment'}
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
          {selectedCone ? (
            <button
              type="button"
              onClick={() => navigate(buildVisibilityConeViewPath(selectedCone.id))}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-medium text-sky-800 transition hover:border-sky-400 hover:bg-sky-50"
            >
              Apri cone
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate(cancelTarget)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => {
              void saveAssignment()
            }}
            disabled={loading || saving || cones.length === 0 || !draft.coneId.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva assignment'}
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
      ) : (
        <div className="mt-5 space-y-5">
          {cones.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Serve almeno un cone prima di creare o modificare un assignment.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              <span className="flex items-center justify-between gap-3">
                <span>Cone</span>
                {selectedCone ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildVisibilityConeViewPath(selectedCone.id))}
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-sky-700 transition hover:text-sky-900"
                  >
                    Apri cone
                  </button>
                ) : null}
              </span>
              <select
                value={draft.coneId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    coneId: event.target.value,
                  }))
                }
                disabled={cones.length === 0}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  {cones.length === 0 ? 'Nessun cone disponibile' : 'Seleziona un cone'}
                </option>
                {cones.map((cone) => (
                  <option key={cone.id} value={cone.id}>
                    {cone.code}
                  </option>
                ))}
              </select>
              {selectedCone?.name ? (
                <p className="mt-2 text-xs font-normal text-slate-500">{selectedCone.name}</p>
              ) : null}
            </label>

            <label className="text-sm font-medium text-slate-700">
              Contact ID
              <input
                type="text"
                value={draft.contactId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    contactId: event.target.value,
                  }))
                }
                placeholder="003..."
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Permission Code
              <input
                list="visibility-assignment-permission-codes"
                type="text"
                value={draft.permissionCode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    permissionCode: event.target.value,
                  }))
                }
                placeholder="PORTAL_USER"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
              <datalist id="visibility-assignment-permission-codes">
                {permissionCodes.map((permissionCode) => (
                  <option key={permissionCode} value={permissionCode} />
                ))}
              </datalist>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Record Type
              <input
                type="text"
                value={draft.recordType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recordType: event.target.value,
                  }))
                }
                placeholder="Partner"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Valid From
              <input
                type="datetime-local"
                value={draft.validFrom}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    validFrom: event.target.value,
                  }))
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Valid To
              <input
                type="datetime-local"
                value={draft.validTo}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    validTo: event.target.value,
                  }))
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
          </div>

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Imposta almeno uno tra <code className="font-mono text-xs">contactId</code>,{' '}
            <code className="font-mono text-xs">permissionCode</code> e{' '}
            <code className="font-mono text-xs">recordType</code>. I selettori valorizzati vengono
            combinati con semantica <code className="font-mono text-xs">AND</code>.
          </p>
        </div>
      )}
    </section>
  )
}
