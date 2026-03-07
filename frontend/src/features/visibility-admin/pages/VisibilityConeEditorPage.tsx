import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  createVisibilityCone,
  fetchVisibilityCone,
  updateVisibilityCone,
} from '../visibility-admin-api'
import type { VisibilityCone } from '../visibility-admin-types'
import {
  buildVisibilityConeViewPath,
  buildVisibilityConesListPath,
  createEmptyVisibilityConeDraft,
  createVisibilityConeDraft,
  parseVisibilityConeDraft,
  type VisibilityConeDraft,
} from '../visibility-admin-utils'

type VisibilityConeEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  coneId?: string
}

export function VisibilityConeEditorPage({ mode }: VisibilityConeEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const previousConeId = params.coneId ? decodeURIComponent(params.coneId) : null
  const [draft, setDraft] = useState<VisibilityConeDraft>(createEmptyVisibilityConeDraft())
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'edit' || !previousConeId) {
      setDraft(createEmptyVisibilityConeDraft())
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void fetchVisibilityCone(previousConeId)
      .then((payload) => {
        if (cancelled) {
          return
        }

        setDraft(createVisibilityConeDraft(payload.cone))
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento visibility cone'
        setPageError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mode, previousConeId])

  const saveCone = async () => {
    let parsedCone: Omit<VisibilityCone, 'id'>

    try {
      parsedCone = parseVisibilityConeDraft(draft)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cone non valido'
      setPageError(message)
      return
    }

    setSaving(true)
    setPageError(null)

    try {
      const payload =
        mode === 'create'
          ? await createVisibilityCone(parsedCone)
          : await updateVisibilityCone(previousConeId ?? '', parsedCone)

      navigate(buildVisibilityConeViewPath(payload.cone.id), { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore salvataggio visibility cone'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const cancelTarget =
    mode === 'create'
      ? buildVisibilityConesListPath()
      : buildVisibilityConeViewPath(previousConeId ?? '')

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {mode === 'create' ? 'Create' : 'Edit'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {mode === 'create' ? 'Nuovo visibility cone' : draft.code || 'Visibility cone'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
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
              void saveCone()
            }}
            disabled={loading || saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva cone'}
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
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Code
            <input
              type="text"
              value={draft.code}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  code: event.target.value,
                }))
              }
              placeholder="regional-south"
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Name
            <input
              type="text"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Regional South"
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Priority
            <input
              type="number"
              value={draft.priority}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  priority: Number(event.target.value),
                }))
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-sky-500"
            />
            Cone attivo
          </label>
        </div>
      )}
    </section>
  )
}
