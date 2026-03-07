import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  deleteQueryTemplateAdmin,
  fetchQueryTemplateAdmin,
  fetchQueryTemplateAdminList,
  upsertQueryTemplateAdmin,
} from '../query-template-admin-api'
import type {
  QueryTemplate,
  QueryTemplateAdminSummary,
} from '../query-template-admin-types'

const NEW_TEMPLATE_SENTINEL = '__new__'

type QueryTemplateDraft = {
  id: string
  objectApiName: string
  description: string
  soql: string
  maxLimit: string
  defaultParams: DefaultParamDraft[]
}

type DefaultParamDraft = {
  key: string
  type: 'string' | 'number' | 'boolean'
  value: string
}

type RouteParams = {
  templateId?: string
}

export function QueryTemplateAdminPage() {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const isCreateRoute = params.templateId === NEW_TEMPLATE_SENTINEL
  const selectedTemplateId = isCreateRoute ? null : params.templateId ?? null

  const [templates, setTemplates] = useState<QueryTemplateAdminSummary[]>([])
  const [templateDraft, setTemplateDraft] = useState<QueryTemplateDraft>(createEmptyDraft())
  const [aclResourceConfigured, setAclResourceConfigured] = useState(true)
  const [resourceQuery, setResourceQuery] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = resourceQuery.trim().toLowerCase()
    if (normalizedQuery.length === 0) {
      return templates
    }

    return templates.filter((template) =>
      [template.id, template.objectApiName, template.description ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [resourceQuery, templates])

  useEffect(() => {
    let cancelled = false
    setLoadingList(true)

    void fetchQueryTemplateAdminList()
      .then((payload) => {
        if (cancelled) {
          return
        }

        setTemplates(payload.items ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento query templates'
        setPageError(message)
        setTemplates([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingList(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isCreateRoute) {
      setTemplateDraft(createEmptyDraft())
      setAclResourceConfigured(false)
      setLoadingTemplate(false)
      return
    }

    if (!selectedTemplateId) {
      setTemplateDraft(createEmptyDraft())
      setAclResourceConfigured(true)
      return
    }

    let cancelled = false
    setLoadingTemplate(true)

    void fetchQueryTemplateAdmin(selectedTemplateId)
      .then((payload) => {
        if (cancelled) {
          return
        }

        setTemplateDraft(createDraftFromTemplate(payload.template))
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
        setTemplateDraft(createEmptyDraft())
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTemplate(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isCreateRoute, selectedTemplateId])

  const saveTemplate = async () => {
    let nextTemplate: QueryTemplate

    try {
      nextTemplate = parseDraft(templateDraft)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Template non valido'
      setPageError(message)
      return
    }

    setSaving(true)
    setPageError(null)
    setSaveInfo(null)

    try {
      const payload = await upsertQueryTemplateAdmin(nextTemplate.id, nextTemplate)
      setTemplateDraft(createDraftFromTemplate(payload.template))
      setAclResourceConfigured(payload.aclResourceConfigured)
      setSaveInfo(
        isCreateRoute
          ? 'Query template creato su PostgreSQL'
          : 'Query template salvato su PostgreSQL',
      )
      await refreshTemplates()
      navigate(`/admin/query-templates/${encodeURIComponent(payload.template.id)}`, {
        replace: true,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore salvataggio query template'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const removeTemplate = async () => {
    if (!selectedTemplateId || !window.confirm(`Eliminare il template ${selectedTemplateId}?`)) {
      return
    }

    setDeleting(true)
    setPageError(null)
    setSaveInfo(null)

    try {
      await deleteQueryTemplateAdmin(selectedTemplateId)
      await refreshTemplates()
      navigate('/admin/query-templates', { replace: true })
      setSaveInfo('Query template eliminato')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore eliminazione query template'
      setPageError(message)
    } finally {
      setDeleting(false)
    }
  }

  const refreshTemplates = async () => {
    const payload = await fetchQueryTemplateAdminList()
    setTemplates(payload.items ?? [])
  }

  const selectedSummary = selectedTemplateId
    ? templates.find((template) => template.id === selectedTemplateId) ?? null
    : null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Admin
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Query Templates PostgreSQL</h1>
            <p className="mt-2 text-sm text-slate-600">
              CRUD guidato dei template query usati dal runtime `/query/template/:templateId`.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/query-templates/__new__')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Nuovo template
            </button>
            <button
              type="button"
              onClick={() => {
                void saveTemplate()
              }}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {saving ? 'Salvataggio...' : 'Salva template'}
            </button>
            {selectedTemplateId ? (
              <button
                type="button"
                onClick={() => {
                  void removeTemplate()
                }}
                disabled={deleting}
                className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {deleting ? 'Eliminazione...' : 'Elimina'}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {pageError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm text-rose-700">{pageError}</p>
        </section>
      ) : null}

      {saveInfo ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm text-emerald-700">{saveInfo}</p>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Catalogo
              </p>
              <h2 className="text-xl font-semibold text-slate-900">Template registrati</h2>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              {templates.length} elementi
            </span>
          </div>

          <input
            type="search"
            value={resourceQuery}
            onChange={(event) => setResourceQuery(event.target.value)}
            placeholder="Cerca per id, object API name o descrizione"
            className="mt-4 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
          />

          {loadingList ? (
            <p className="mt-4 text-sm text-slate-600">Caricamento lista template...</p>
          ) : null}

          <div className="mt-4 space-y-3">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => navigate(`/admin/query-templates/${encodeURIComponent(template.id)}`)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedTemplateId === template.id
                    ? 'border-slate-900 bg-slate-100'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">{template.id}</p>
                  <span
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                      template.aclResourceConfigured
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {template.aclResourceConfigured ? 'ACL OK' : 'ACL Missing'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{template.objectApiName}</p>
                {template.description ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500">{template.description}</p>
                ) : null}
              </button>
            ))}

            {!loadingList && filteredTemplates.length === 0 ? (
              <p className="text-sm text-slate-500">Nessun template corrispondente.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Editor
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              {isCreateRoute
                ? 'Nuovo query template'
                : selectedSummary
                ? selectedSummary.id
                : 'Seleziona un template'}
            </h2>
            {selectedSummary ? (
              <p className="text-sm text-slate-600">
                Ultimo aggiornamento {new Date(selectedSummary.updatedAt).toLocaleString()}
              </p>
            ) : null}
          </div>

          {loadingTemplate ? (
            <p className="mt-4 text-sm text-slate-600">Caricamento template...</p>
          ) : null}

          {!loadingTemplate && !selectedTemplateId && !isCreateRoute ? (
            <p className="mt-4 text-sm text-slate-600">
              Seleziona un template dal catalogo oppure creane uno nuovo.
            </p>
          ) : null}

          {!loadingTemplate && (selectedTemplateId || isCreateRoute) ? (
            <>
              {!aclResourceConfigured ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Risorsa ACL mancante: <code className="font-mono">query:{templateDraft.id || '...'}</code>.
                  Configurala nel modulo ACL Admin per autorizzare il runtime template.
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Template ID</span>
                  <input
                    type="text"
                    value={templateDraft.id}
                    onChange={(event) =>
                      setTemplateDraft((current) => ({ ...current, id: event.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Object API Name</span>
                  <input
                    type="text"
                    value={templateDraft.objectApiName}
                    onChange={(event) =>
                      setTemplateDraft((current) => ({
                        ...current,
                        objectApiName: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Description</span>
                  <input
                    type="text"
                    value={templateDraft.description}
                    onChange={(event) =>
                      setTemplateDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Max limit</span>
                  <input
                    type="number"
                    min={1}
                    value={templateDraft.maxLimit}
                    onChange={(event) =>
                      setTemplateDraft((current) => ({
                        ...current,
                        maxLimit: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <label className="mt-3 block text-sm text-slate-700">
                <span className="mb-1 block font-medium">SOQL</span>
                <textarea
                  value={templateDraft.soql}
                  onChange={(event) =>
                    setTemplateDraft((current) => ({ ...current, soql: event.target.value }))
                  }
                  rows={10}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900"
                />
              </label>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Default Params</p>
                    <p className="text-xs text-slate-500">
                      Valori scalar `string | number | boolean`.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTemplateDraft((current) => ({
                        ...current,
                        defaultParams: [
                          ...current.defaultParams,
                          { key: '', type: 'string', value: '' },
                        ],
                      }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Aggiungi parametro
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  {templateDraft.defaultParams.map((param, index) => (
                    <div
                      key={`${param.key || 'param'}-${index}`}
                      className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_7rem]"
                    >
                      <input
                        type="text"
                        value={param.key}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({
                            ...current,
                            defaultParams: current.defaultParams.map((entry, currentIndex) =>
                              currentIndex === index
                                ? { ...entry, key: event.target.value }
                                : entry,
                            ),
                          }))
                        }
                        placeholder="Parametro"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                      <select
                        value={param.type}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({
                            ...current,
                            defaultParams: current.defaultParams.map((entry, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...entry,
                                    type: event.target.value as DefaultParamDraft['type'],
                                  }
                                : entry,
                            ),
                          }))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                      </select>
                      <input
                        type="text"
                        value={param.value}
                        onChange={(event) =>
                          setTemplateDraft((current) => ({
                            ...current,
                            defaultParams: current.defaultParams.map((entry, currentIndex) =>
                              currentIndex === index
                                ? { ...entry, value: event.target.value }
                                : entry,
                            ),
                          }))
                        }
                        placeholder="Valore"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setTemplateDraft((current) => ({
                            ...current,
                            defaultParams: current.defaultParams.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          }))
                        }
                        className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ))}

                  {templateDraft.defaultParams.length === 0 ? (
                    <p className="text-sm text-slate-500">Nessun parametro di default configurato.</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function createEmptyDraft(): QueryTemplateDraft {
  return {
    id: '',
    objectApiName: '',
    description: '',
    soql: '',
    maxLimit: '',
    defaultParams: [],
  }
}

function createDraftFromTemplate(template: QueryTemplate): QueryTemplateDraft {
  return {
    id: template.id,
    objectApiName: template.objectApiName,
    description: template.description ?? '',
    soql: template.soql,
    maxLimit: template.maxLimit ? String(template.maxLimit) : '',
    defaultParams: Object.entries(template.defaultParams ?? {}).map(([key, value]) => ({
      key,
      type:
        typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
      value: String(value),
    })),
  }
}

function parseDraft(draft: QueryTemplateDraft): QueryTemplate {
  const id = draft.id.trim()
  const objectApiName = draft.objectApiName.trim()
  const soql = draft.soql.trim()

  if (!id) {
    throw new Error('Template ID obbligatorio')
  }

  if (!objectApiName) {
    throw new Error('Object API Name obbligatorio')
  }

  if (!soql) {
    throw new Error('SOQL obbligatoria')
  }

  const defaultParamsEntries = draft.defaultParams
    .filter((param) => param.key.trim().length > 0)
    .map<[string, string | number | boolean]>((param) => {
      const key = param.key.trim()

      if (param.type === 'number') {
        const parsed = Number(param.value)
        if (!Number.isFinite(parsed)) {
          throw new Error(`Default param ${key} deve essere numerico`)
        }

        return [key, parsed]
      }

      if (param.type === 'boolean') {
        const normalized = param.value.trim().toLowerCase()
        if (normalized !== 'true' && normalized !== 'false') {
          throw new Error(`Default param ${key} deve essere true o false`)
        }

        return [key, normalized === 'true']
      }

      return [key, param.value]
    })

  const maxLimit = draft.maxLimit.trim().length > 0 ? Number(draft.maxLimit) : undefined
  if (maxLimit !== undefined && (!Number.isInteger(maxLimit) || maxLimit <= 0)) {
    throw new Error('Max limit deve essere un intero positivo')
  }

  return {
    id,
    objectApiName,
    description: draft.description.trim() || undefined,
    soql,
    defaultParams:
      defaultParamsEntries.length > 0 ? Object.fromEntries(defaultParamsEntries) : undefined,
    maxLimit,
  }
}
