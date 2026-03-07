import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { QueryTemplateEditorForm } from '../components/QueryTemplateEditorForm'
import {
  fetchQueryTemplateAdmin,
  upsertQueryTemplateAdmin,
} from '../query-template-admin-api'
import type { QueryTemplate } from '../query-template-admin-types'
import {
  buildQueryTemplateListPath,
  buildQueryTemplateViewPath,
  createEmptyQueryTemplateDraft,
  createQueryTemplateDraft,
  parseQueryTemplateDraft,
  type QueryTemplateDraft,
} from '../query-template-admin-utils'

type QueryTemplateEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  templateId?: string
}

export function QueryTemplateEditorPage({ mode }: QueryTemplateEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const previousTemplateId = params.templateId ? decodeURIComponent(params.templateId) : null
  const [draft, setDraft] = useState<QueryTemplateDraft>(createEmptyQueryTemplateDraft())
  const [aclResourceConfigured, setAclResourceConfigured] = useState(mode === 'edit')
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'edit' || !previousTemplateId) {
      setDraft(createEmptyQueryTemplateDraft())
      setAclResourceConfigured(false)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void fetchQueryTemplateAdmin(previousTemplateId)
      .then((payload) => {
        if (cancelled) {
          return
        }

        setDraft(createQueryTemplateDraft(payload.template))
        setAclResourceConfigured(payload.aclResourceConfigured)
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento query template'
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
  }, [mode, previousTemplateId])

  const saveTemplate = async () => {
    let parsedTemplate: QueryTemplate

    try {
      parsedTemplate = parseQueryTemplateDraft(draft)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Template non valido'
      setPageError(message)
      return
    }

    const routeTemplateId = mode === 'edit' ? previousTemplateId : parsedTemplate.id
    if (!routeTemplateId) {
      setPageError('Template ID mancante')
      return
    }

    const nextTemplate =
      mode === 'edit' && previousTemplateId
        ? { ...parsedTemplate, id: previousTemplateId }
        : parsedTemplate

    setSaving(true)
    setPageError(null)

    try {
      const payload = await upsertQueryTemplateAdmin(routeTemplateId, nextTemplate)
      navigate(buildQueryTemplateViewPath(payload.template.id), { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore salvataggio query template'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const cancelTarget =
    mode === 'create' ? buildQueryTemplateListPath() : buildQueryTemplateViewPath(previousTemplateId ?? draft.id)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {mode === 'create' ? 'Create' : 'Edit'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {mode === 'create' ? 'Nuovo query template' : previousTemplateId || 'Query template'}
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
              void saveTemplate()
            }}
            disabled={loading || saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva template'}
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
      ) : (
        <QueryTemplateEditorForm
          draft={draft}
          setDraft={setDraft}
          aclResourceConfigured={aclResourceConfigured}
          disableIdField={mode === 'edit'}
          idHelperText={
            mode === 'edit'
              ? 'Il template ID resta stabile dopo la creazione. Per un nuovo ID crea un nuovo template.'
              : undefined
          }
        />
      )}
    </section>
  )
}
