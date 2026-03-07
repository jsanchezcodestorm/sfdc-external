import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import type {
  EntityConfig,
} from '../../entities/entity-types'
import {
  fetchEntityAdminConfig,
  fetchEntityAdminConfigList,
  searchEntityAdminObjectApiNames,
  upsertEntityAdminConfig,
} from '../entity-admin-api'
import type {
  EntityAdminConfigSummary,
  EntityConfigSectionKey,
  SalesforceObjectApiNameSuggestion,
} from '../entity-admin-types'
import { EntityConfigBaseForm } from '../components/EntityConfigBaseForm'
import { EntityConfigDetailForm } from '../components/EntityConfigDetailForm'
import { EntityConfigFormForm } from '../components/EntityConfigFormForm'
import {
  createDetailFormDraft,
  createEmptyDetailFormDraft,
  parseDetailFormDraft,
} from '../components/detail-form/detail-form.mapper'
import type { DetailFormDraft } from '../components/detail-form/detail-form.types'
import {
  createEmptyFormDraft,
  createFormDraft,
  parseFormDraft,
} from '../components/form-form/form-form.mapper'
import type { FormFormDraft } from '../components/form-form/form-form.types'
import { EntityConfigListForm } from '../components/EntityConfigListForm'
import {
  createEmptyListFormDraft,
  createEmptyListViewDraft,
  createListFormDraft,
  parseListFormDraft,
} from '../list-form/list-form.mapper'
import type {
  ListActionDraft,
  ListFormDraft,
  ListViewDraft,
} from '../list-form/list-form.types'
import { EntityConfigSectionEditor } from '../components/EntityConfigSectionEditor'

const sectionLabels: Record<EntityConfigSectionKey, string> = {
  base: 'Base',
  list: 'List',
  detail: 'Detail',
  form: 'Form',
}

const sectionOrder: EntityConfigSectionKey[] = ['base', 'list', 'detail', 'form']
const NEW_ENTITY_SENTINEL = '__new__'

type AdminRouteParams = {
  entityId?: string
  section?: string
}

export function EntityAdminConfigPage() {
  const navigate = useNavigate()
  const params = useParams<AdminRouteParams>()

  const isCreateRoute = isNewEntityParam(params.entityId)
  const selectedEntityId = normalizeEntityIdParam(params.entityId)
  const selectedSection = normalizeSectionParam(params.section)

  const [entities, setEntities] = useState<EntityAdminConfigSummary[]>([])
  const [selectedEntityConfig, setSelectedEntityConfig] = useState<EntityConfig | null>(null)
  const [baseFormDraft, setBaseFormDraft] = useState<BaseFormDraft>(createEmptyBaseFormDraft())
  const [listFormDraft, setListFormDraft] = useState<ListFormDraft>(createEmptyListFormDraft())
  const [detailFormDraft, setDetailFormDraft] = useState<DetailFormDraft>(
    createEmptyDetailFormDraft(),
  )
  const [formFormDraft, setFormFormDraft] = useState<FormFormDraft>(createEmptyFormDraft())
  const [selectedListViewIndex, setSelectedListViewIndex] = useState(0)
  const [sectionDraft, setSectionDraft] = useState('')
  const [resourceQuery, setResourceQuery] = useState('')
  const [objectApiNameSearchInput, setObjectApiNameSearchInput] = useState('')
  const [objectApiNameSuggestions, setObjectApiNameSuggestions] = useState<
    SalesforceObjectApiNameSuggestion[]
  >([])
  const [loadingObjectApiNameSuggestions, setLoadingObjectApiNameSuggestions] =
    useState(false)
  const [objectApiNameSuggestionsError, setObjectApiNameSuggestionsError] =
    useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)

  const selectedEntitySummary = useMemo(
    () => entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [entities, selectedEntityId],
  )
  const isEntityListRoute = selectedEntityId === null && !isCreateRoute

  const filteredEntities = useMemo(() => {
    const normalizedQuery = resourceQuery.trim().toLowerCase()

    if (normalizedQuery.length === 0) {
      return entities
    }

    return entities.filter((entity) =>
      [entity.label, entity.id, entity.objectApiName]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [entities, resourceQuery])

  const hashPath = selectedEntityId
    ? buildAdminPath(selectedEntityId, selectedSection)
    : isCreateRoute
      ? buildCreateAdminPath()
    : '/admin/entity-config'

  const navigateToEntitySection = useCallback(
    (entityId: string, section: EntityConfigSectionKey, replace = false) => {
      navigate(buildAdminPath(entityId, section), { replace })
    },
    [navigate],
  )

  const navigateToCreateEntity = useCallback((replace = false) => {
    navigate(buildCreateAdminPath(), { replace })
  }, [navigate])

  const refreshEntityList = useCallback(async () => {
    setLoadingList(true)

    try {
      const payload = await fetchEntityAdminConfigList()
      const nextItems = payload.items ?? []
      setEntities(nextItems)
      setPageError(null)

      if (isCreateRoute && params.section !== 'base') {
        navigateToCreateEntity(true)
      }

      if (nextItems.length === 0) {
        if (!isCreateRoute) {
          setSelectedEntityConfig(null)
        }

        if (!isCreateRoute && (selectedEntityId || params.section)) {
          navigate('/admin/entity-config', { replace: true })
        }

        return
      }

      const hasSelectedEntity =
        selectedEntityId !== null &&
        nextItems.some((item) => item.id === selectedEntityId)

      if (!isCreateRoute && selectedEntityId && !hasSelectedEntity) {
        navigate('/admin/entity-config', { replace: true })
        return
      }

      if (isCreateRoute && params.section !== 'base') {
        navigateToCreateEntity(true)
      }

      if (!isCreateRoute && selectedEntityId && params.section !== selectedSection) {
        navigateToEntitySection(selectedEntityId, selectedSection, true)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore caricamento entity admin config'
      setPageError(message)
      setEntities([])
      setSelectedEntityConfig(null)
    } finally {
      setLoadingList(false)
    }
  }, [
    navigate,
    isCreateRoute,
    navigateToCreateEntity,
    navigateToEntitySection,
    params.section,
    selectedEntityId,
    selectedSection,
  ])

  const loadSelectedEntityConfig = useCallback(async () => {
    if (isCreateRoute) {
      setSelectedEntityConfig(createEmptyEntityConfig())
      setLoadingConfig(false)
      setPageError(null)
      return
    }

    if (!selectedEntityId) {
      setSelectedEntityConfig(null)
      return
    }

    setLoadingConfig(true)
    try {
      const payload = await fetchEntityAdminConfig(selectedEntityId)
      setSelectedEntityConfig(payload.entity)
      setPageError(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore caricamento dettaglio entity config'
      setPageError(message)
      setSelectedEntityConfig(null)
    } finally {
      setLoadingConfig(false)
    }
  }, [isCreateRoute, selectedEntityId])

  useEffect(() => {
    void refreshEntityList()
  }, [refreshEntityList])

  useEffect(() => {
    void loadSelectedEntityConfig()
  }, [loadSelectedEntityConfig])

  useEffect(() => {
    if (!selectedEntityConfig) {
      setBaseFormDraft(createEmptyBaseFormDraft())
      setListFormDraft(createEmptyListFormDraft())
      setDetailFormDraft(createEmptyDetailFormDraft())
      setFormFormDraft(createEmptyFormDraft())
      setSelectedListViewIndex(0)
      setSectionDraft('')
      setObjectApiNameSearchInput('')
      setObjectApiNameSuggestions([])
      setObjectApiNameSuggestionsError(null)
      return
    }

    setBaseFormDraft(createBaseFormDraft(selectedEntityConfig))
    setListFormDraft(createListFormDraft(selectedEntityConfig.list))
    setDetailFormDraft(createDetailFormDraft(selectedEntityConfig.detail))
    setFormFormDraft(createFormDraft(selectedEntityConfig.form))
    setSelectedListViewIndex(0)

    if (
      selectedSection === 'base' ||
      selectedSection === 'list' ||
      selectedSection === 'detail' ||
      selectedSection === 'form'
    ) {
      setSectionDraft('')
      setEditorError(null)
      return
    }

    setObjectApiNameSearchInput('')
    setObjectApiNameSuggestions([])
    setObjectApiNameSuggestionsError(null)

    const sectionValue = extractSectionValue(selectedEntityConfig, selectedSection)
    setSectionDraft(JSON.stringify(sectionValue, null, 2))
    setEditorError(null)
  }, [selectedEntityConfig, selectedSection])

  const handleSelectEntity = useCallback((entityId: string) => {
    navigateToEntitySection(entityId, selectedSection)
  }, [navigateToEntitySection, selectedSection])

  const handleSelectSection = useCallback((section: EntityConfigSectionKey) => {
    if (!selectedEntityId) {
      return
    }

    navigateToEntitySection(selectedEntityId, section)
  }, [navigateToEntitySection, selectedEntityId])

  const handleBackToEntityList = useCallback(() => {
    navigate('/admin/entity-config')
  }, [navigate])

  const handleCreateEntity = useCallback(() => {
    navigateToCreateEntity()
  }, [navigateToCreateEntity])

  const applySectionDraft = () => {
    if (!selectedEntityConfig) {
      return
    }

    try {
      const parsed = JSON.parse(sectionDraft) as unknown
      const nextConfig = applySectionToEntityConfig(
        selectedEntityConfig,
        selectedSection,
        parsed,
      )
      setSelectedEntityConfig(nextConfig)
      setEditorError(null)
      setSaveInfo(`Sezione ${sectionLabels[selectedSection]} applicata in locale`)

      if (selectedSection === 'base' && nextConfig.id !== selectedEntityId) {
        navigateToEntitySection(nextConfig.id, selectedSection)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON non valido'
      setEditorError(`Errore parse JSON: ${message}`)
    }
  }

  const updateBaseDraftField = (field: BaseFormDraftKey, value: string) => {
    setBaseFormDraft((current) => ({
      ...current,
      [field]: value,
    }))

    if (field === 'objectApiName') {
      setObjectApiNameSearchInput(value)
    }

    setSaveInfo(null)
    setEditorError(null)
  }

  const applyBaseDraft = () => {
    if (!selectedEntityConfig) {
      return
    }

    const parsedSection = {
      id: baseFormDraft.id,
      label: baseFormDraft.label,
      description: baseFormDraft.description,
      objectApiName: baseFormDraft.objectApiName,
      navigation: {
        basePath: baseFormDraft.basePath,
      },
    }

    try {
      const nextConfig = applySectionToEntityConfig(selectedEntityConfig, 'base', parsedSection)
      setSelectedEntityConfig(nextConfig)
      setEditorError(null)
      setSaveInfo('Sezione Base applicata in locale')

      if (nextConfig.id !== selectedEntityId) {
        navigateToEntitySection(nextConfig.id, 'base')
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Valori form non validi per la sezione Base'
      setEditorError(message)
    }
  }

  const selectObjectApiNameSuggestion = (value: string) => {
    updateBaseDraftField('objectApiName', value)
    setObjectApiNameSearchInput('')
    setObjectApiNameSuggestions([])
    setObjectApiNameSuggestionsError(null)
  }

  const updateListField = (field: 'title' | 'subtitle', value: string) => {
    setListFormDraft((current) => ({
      ...current,
      [field]: value,
    }))
    setSaveInfo(null)
    setEditorError(null)
  }

  const updateListPrimaryActionField = (
    field: keyof ListActionDraft,
    value: string,
  ) => {
    setListFormDraft((current) => ({
      ...current,
      primaryAction: {
        ...current.primaryAction,
        [field]: value,
      },
    }))
    setSaveInfo(null)
    setEditorError(null)
  }

  const updateListViewField = (
    index: number,
    field: Exclude<
      keyof ListViewDraft,
      'default' | 'primaryAction' | 'queryFields' | 'searchFields'
    >,
    value: string,
  ) => {
    setListFormDraft((current) => {
      if (!current.views[index]) {
        return current
      }

      const nextViews = [...current.views]
      nextViews[index] = {
        ...nextViews[index],
        [field]: value,
      }

      return {
        ...current,
        views: nextViews,
      }
    })

    setSaveInfo(null)
    setEditorError(null)
  }

  const updateListViewSelectionField = (
    index: number,
    field: 'queryFields' | 'searchFields',
    value: string[],
  ) => {
    setListFormDraft((current) => {
      if (!current.views[index]) {
        return current
      }

      const nextViews = [...current.views]
      nextViews[index] = {
        ...nextViews[index],
        [field]: value,
      }

      return {
        ...current,
        views: nextViews,
      }
    })
    setSaveInfo(null)
    setEditorError(null)
  }

  const updateListViewPrimaryActionField = (
    index: number,
    field: keyof ListActionDraft,
    value: string,
  ) => {
    setListFormDraft((current) => {
      if (!current.views[index]) {
        return current
      }

      const nextViews = [...current.views]
      nextViews[index] = {
        ...nextViews[index],
        primaryAction: {
          ...nextViews[index].primaryAction,
          [field]: value,
        },
      }

      return {
        ...current,
        views: nextViews,
      }
    })
    setSaveInfo(null)
    setEditorError(null)
  }

  const toggleListViewDefault = (index: number, checked: boolean) => {
    setListFormDraft((current) => {
      const nextViews = current.views.map((view, currentIndex) => ({
        ...view,
        default: checked ? currentIndex === index : currentIndex === index ? false : view.default,
      }))

      return {
        ...current,
        views: nextViews,
      }
    })
    setSaveInfo(null)
    setEditorError(null)
  }

  const addListViewDraft = () => {
    const nextViewIndex = listFormDraft.views.length
    setListFormDraft((current) => ({
      ...current,
      views: [
        ...current.views,
        createEmptyListViewDraft(`view-${current.views.length + 1}`),
      ],
    }))
    setSelectedListViewIndex(nextViewIndex)
    setSaveInfo(null)
    setEditorError(null)
  }

  const removeListViewDraft = (index: number) => {
    setListFormDraft((current) => {
      if (current.views.length <= 1 || !current.views[index]) {
        return current
      }

      return {
        ...current,
        views: current.views.filter((_, currentIndex) => currentIndex !== index),
      }
    })
    setSaveInfo(null)
    setEditorError(null)
  }

  const handleSelectListView = (index: number) => {
    setSelectedListViewIndex(index)
  }

  const applyListDraft = () => {
    if (!selectedEntityConfig) {
      return
    }

    try {
      const parsedList = parseListFormDraft(
        listFormDraft,
        selectedEntityConfig.objectApiName ?? '',
      )
      const nextConfig = applySectionToEntityConfig(selectedEntityConfig, 'list', parsedList)
      setSelectedEntityConfig(nextConfig)
      setEditorError(null)
      setSaveInfo('Sezione List applicata in locale')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Valori form non validi per la sezione List'
      setEditorError(message)
    }
  }

  const updateDetailDraft = (nextDraft: DetailFormDraft) => {
    setDetailFormDraft(nextDraft)
    setSaveInfo(null)
    setEditorError(null)
  }

  const applyDetailDraft = () => {
    if (!selectedEntityConfig) {
      return
    }

    try {
      const parsedDetail = parseDetailFormDraft(
        detailFormDraft,
        selectedEntityConfig.objectApiName ?? '',
      )
      const nextConfig = applySectionToEntityConfig(selectedEntityConfig, 'detail', parsedDetail)
      setSelectedEntityConfig(nextConfig)
      setEditorError(null)
      setSaveInfo('Sezione Detail applicata in locale')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Valori form non validi per la sezione Detail'
      setEditorError(message)
    }
  }

  const applyFormDraft = () => {
    if (!selectedEntityConfig) {
      return
    }

    try {
      const parsedForm = parseFormDraft(
        formFormDraft,
        selectedEntityConfig.objectApiName ?? '',
      )
      const nextConfig = applySectionToEntityConfig(selectedEntityConfig, 'form', parsedForm)
      setSelectedEntityConfig(nextConfig)
      setEditorError(null)
      setSaveInfo('Sezione Form applicata in locale')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Valori form non validi per la sezione Form'
      setEditorError(message)
    }
  }

  const saveSelectedEntityConfig = async () => {
    if (!selectedEntityConfig) {
      return
    }

    setSaving(true)
    setSaveInfo(null)
    setPageError(null)

    try {
      const payload = await upsertEntityAdminConfig(
        selectedEntityConfig.id,
        selectedEntityConfig,
      )
      setSelectedEntityConfig(payload.entity)
      setSaveInfo(
        isCreateRoute ? 'Entity creata su PostgreSQL' : 'Configurazione salvata su PostgreSQL',
      )
      navigateToEntitySection(payload.entity.id, selectedSection, true)
      await refreshEntityList()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore salvataggio entity config'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const saveNewEntityConfig = async () => {
    const nextConfig = createEntityConfigFromBaseDraft(baseFormDraft)

    if (!nextConfig) {
      setEditorError(
        baseFormDraft.id.trim() === NEW_ENTITY_SENTINEL
          ? `Entity Id non puo essere ${NEW_ENTITY_SENTINEL}`
          : 'Compila id, label e objectApiName per creare la entity',
      )
      return
    }

    setSaving(true)
    setSaveInfo(null)
    setPageError(null)
    setEditorError(null)

    try {
      const payload = await upsertEntityAdminConfig(nextConfig.id, nextConfig)
      setSelectedEntityConfig(payload.entity)
      setSaveInfo('Entity creata su PostgreSQL')
      navigateToEntitySection(payload.entity.id, 'base', true)
      await refreshEntityList()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore creazione entity config'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    setSelectedListViewIndex((current) => {
      if (listFormDraft.views.length === 0) {
        return 0
      }

      const maxIndex = listFormDraft.views.length - 1
      return current > maxIndex ? maxIndex : current
    })
  }, [listFormDraft.views.length])

  useEffect(() => {
    setSaveInfo(null)
  }, [isCreateRoute, selectedEntityId, selectedSection])

  const canSearchObjectApiNameSuggestions =
    selectedSection === 'base' && selectedEntityConfig !== null
  const objectApiNameSearchValue = objectApiNameSearchInput.trim()
  const shouldShowObjectApiNameSuggestions =
    canSearchObjectApiNameSuggestions &&
    objectApiNameSearchValue.length >= 2 &&
    (loadingObjectApiNameSuggestions ||
      objectApiNameSuggestions.length > 0 ||
      objectApiNameSuggestionsError !== null)

  useEffect(() => {
    if (!canSearchObjectApiNameSuggestions) {
      setObjectApiNameSuggestions([])
      setObjectApiNameSuggestionsError(null)
      setLoadingObjectApiNameSuggestions(false)
      return
    }

    if (objectApiNameSearchValue.length < 2) {
      setObjectApiNameSuggestions([])
      setObjectApiNameSuggestionsError(null)
      setLoadingObjectApiNameSuggestions(false)
      return
    }

    let cancelled = false
    setLoadingObjectApiNameSuggestions(true)
    setObjectApiNameSuggestionsError(null)

    const timeoutId = window.setTimeout(() => {
      void searchEntityAdminObjectApiNames(objectApiNameSearchValue, 8)
        .then((payload) => {
          if (cancelled) {
            return
          }

          setObjectApiNameSuggestions(payload.items ?? [])
          setObjectApiNameSuggestionsError(null)
        })
        .catch((error) => {
          if (cancelled) {
            return
          }

          const message =
            error instanceof Error
              ? error.message
              : 'Errore ricerca object Salesforce'
          setObjectApiNameSuggestions([])
          setObjectApiNameSuggestionsError(message)
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingObjectApiNameSuggestions(false)
          }
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [canSearchObjectApiNameSuggestions, objectApiNameSearchValue])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Admin
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight">
                  Entity Config PostgreSQL
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  {isCreateRoute
                    ? 'Creazione di una nuova entity tramite configurazione base minima.'
                    : isEntityListRoute
                    ? 'Catalogo entità dedicato, pensato per trovare e aprire rapidamente una configurazione.'
                    : 'Workspace di editing con pannelli contestuali per la configurazione selezionata.'}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Path: <code className="font-mono">#{hashPath}</code>
                </p>
              </div>

              {isCreateRoute ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleBackToEntityList}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Torna al catalogo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveNewEntityConfig()
                    }}
                    disabled={saving}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
                  >
                    {saving ? 'Creazione...' : 'Crea entity'}
                  </button>
                </div>
              ) : !isEntityListRoute && selectedEntitySummary ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleBackToEntityList}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Lista entità
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveSelectedEntityConfig()
                    }}
                    disabled={!selectedEntityConfig || saving}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
                  >
                    {saving ? 'Salvataggio...' : 'Salva su PostgreSQL'}
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          {!isEntityListRoute && !isCreateRoute && selectedEntitySummary ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Pannelli configurazione
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Navigazione locale dell&apos;entità selezionata. La sidebar sinistra resta riservata ai moduli admin.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {sectionOrder.map((section) => (
                    <button
                      key={section}
                      type="button"
                      onClick={() => handleSelectSection(section)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        selectedSection === section
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {sectionLabels[section]}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {loadingList ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-600">Caricamento entity admin list...</p>
            </section>
          ) : null}

          {pageError ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
              <p className="text-sm text-rose-700">{pageError}</p>
            </section>
          ) : null}

          {!loadingList && !pageError && entities.length === 0 && !isCreateRoute ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-600">
                Nessuna entity configurata in PostgreSQL.
              </p>
            </section>
          ) : null}

          {!loadingList && !pageError && isEntityListRoute ? (
            <EntityAdminCatalog
              entities={filteredEntities}
              query={resourceQuery}
              onQueryChange={setResourceQuery}
              onSelectEntity={handleSelectEntity}
              onCreateEntity={handleCreateEntity}
            />
          ) : null}

          {isCreateRoute ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Nuova entity
                  </p>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Compila la sezione Base
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Per la creazione iniziale sono richiesti solo `id`, `label` e `objectApiName`.
                  </p>
                </div>
              </div>

              {saveInfo ? (
                <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {saveInfo}
                </p>
              ) : null}
            </section>
          ) : null}

          {!isEntityListRoute && selectedEntitySummary ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Entity Selezionata
                  </p>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {selectedEntitySummary.label}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedEntitySummary.id} - {selectedEntitySummary.objectApiName}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <SummaryChip label="Views" value={selectedEntitySummary.viewCount} />
                <SummaryChip
                  label="Detail Sections"
                  value={selectedEntitySummary.detailSectionCount}
                />
                <SummaryChip
                  label="Related Lists"
                  value={selectedEntitySummary.relatedListCount}
                />
                <SummaryChip
                  label="Form Sections"
                  value={selectedEntitySummary.formSectionCount}
                />
              </div>

              {saveInfo ? (
                <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {saveInfo}
                </p>
              ) : null}
            </section>
          ) : null}

          {loadingConfig ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-600">Caricamento configurazione entity...</p>
            </section>
          ) : null}

          {!loadingConfig && selectedEntityConfig ? (
            selectedSection === 'base' ? (
              <EntityConfigBaseForm
                value={baseFormDraft}
                error={editorError}
                onChange={updateBaseDraftField}
                suggestions={objectApiNameSuggestions}
                suggestionsLoading={loadingObjectApiNameSuggestions}
                suggestionsError={objectApiNameSuggestionsError}
                showSuggestions={shouldShowObjectApiNameSuggestions}
                onSelectSuggestion={selectObjectApiNameSuggestion}
                onApply={applyBaseDraft}
                eyebrow={isCreateRoute ? 'Create' : 'Form'}
                title={isCreateRoute ? 'Nuova entity' : 'Sezione BASE'}
                showApplyButton={!isCreateRoute}
              />
            ) : !isCreateRoute && selectedSection === 'list' ? (
              <EntityConfigListForm
                value={listFormDraft}
                error={editorError}
                baseObjectApiName={selectedEntityConfig.objectApiName ?? ''}
                selectedViewIndex={selectedListViewIndex}
                onChangeField={updateListField}
                onChangePrimaryAction={updateListPrimaryActionField}
                onSelectView={handleSelectListView}
                onAddView={addListViewDraft}
                onRemoveView={removeListViewDraft}
                onChangeViewField={updateListViewField}
                onChangeViewSelectionField={updateListViewSelectionField}
                onChangeViewPrimaryAction={updateListViewPrimaryActionField}
                onToggleViewDefault={toggleListViewDefault}
                onApply={applyListDraft}
              />
            ) : !isCreateRoute && selectedSection === 'detail' ? (
              <EntityConfigDetailForm
                value={detailFormDraft}
                error={editorError}
                baseObjectApiName={selectedEntityConfig.objectApiName ?? ''}
                onChange={updateDetailDraft}
                onApply={applyDetailDraft}
              />
            ) : !isCreateRoute && selectedSection === 'form' ? (
              <EntityConfigFormForm
                value={formFormDraft}
                error={editorError}
                baseObjectApiName={selectedEntityConfig.objectApiName ?? ''}
                onChange={setFormFormDraft}
                onApply={applyFormDraft}
              />
            ) : !isCreateRoute ? (
              <EntityConfigSectionEditor
                section={selectedSection}
                value={sectionDraft}
                error={editorError}
                onChange={setSectionDraft}
                onApply={applySectionDraft}
              />
            ) : null
            
          ) : null}
    </div>
  )
}

type SummaryChipProps = {
  label: string
  value: number
}

type EntityAdminCatalogProps = {
  entities: EntityAdminConfigSummary[]
  query: string
  onQueryChange: (value: string) => void
  onSelectEntity: (entityId: string) => void
  onCreateEntity: () => void
}

function EntityAdminCatalog({
  entities,
  query,
  onQueryChange,
  onSelectEntity,
  onCreateEntity,
}: EntityAdminCatalogProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Catalogo
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            Lista entità configurate
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Seleziona una riga per entrare nel workspace della singola configurazione.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:min-w-80">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Filtro
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Cerca per label, id o object API name"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={onCreateEntity}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Nuova entity
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_repeat(3,minmax(84px,0.6fr))_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <span>Entità</span>
              <span>Object</span>
              <span>Views</span>
              <span>Detail</span>
              <span>Form</span>
              <span className="text-right">Azione</span>
            </div>

            {entities.length === 0 ? (
              <div className="px-4 py-10 text-sm text-slate-500">
                {query.trim().length > 0
                  ? 'Nessuna entità corrisponde al filtro.'
                  : 'Nessuna entità disponibile.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {entities.map((entity) => (
                  <article
                    key={entity.id}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_repeat(3,minmax(84px,0.6fr))_auto] gap-3 px-4 py-4 text-sm text-slate-700"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{entity.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        ID {entity.id} · aggiornato {formatTimestamp(entity.updatedAt)}
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-slate-600">{entity.objectApiName}</div>
                    <div className="font-medium text-slate-900">{entity.viewCount}</div>
                    <div className="font-medium text-slate-900">{entity.detailSectionCount}</div>
                    <div className="font-medium text-slate-900">{entity.formSectionCount}</div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onSelectEntity(entity.id)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Apri
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function SummaryChip({ label, value }: SummaryChipProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </article>
  )
}

function isSectionKey(value: string | undefined): value is EntityConfigSectionKey {
  return value === 'base' || value === 'list' || value === 'detail' || value === 'form'
}

function isNewEntityParam(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() === NEW_ENTITY_SENTINEL
}

function normalizeEntityIdParam(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed !== NEW_ENTITY_SENTINEL ? trimmed : null
}

function normalizeSectionParam(value: string | undefined): EntityConfigSectionKey {
  return isSectionKey(value) ? value : 'base'
}

function buildAdminPath(entityId: string, section: EntityConfigSectionKey): string {
  return `/admin/entity-config/${encodeURIComponent(entityId)}/${section}`
}

function buildCreateAdminPath(): string {
  return `/admin/entity-config/${NEW_ENTITY_SENTINEL}/base`
}

function formatTimestamp(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function extractSectionValue(
  entity: EntityConfig,
  section: EntityConfigSectionKey,
): unknown {
  if (section === 'base') {
    return {
      id: entity.id,
      label: entity.label,
      description: entity.description,
      objectApiName: entity.objectApiName,
      navigation: entity.navigation,
    }
  }

  if (section === 'list') {
    return entity.list ?? null
  }

  if (section === 'detail') {
    return entity.detail ?? null
  }

  return entity.form ?? null
}

function applySectionToEntityConfig(
  entity: EntityConfig,
  section: EntityConfigSectionKey,
  parsedSection: unknown,
): EntityConfig {
  if (!isObjectRecord(entity)) {
    throw new Error('Config entity non valida')
  }

  if (section === 'base') {
    if (!isObjectRecord(parsedSection)) {
      throw new Error('La sezione base deve essere un oggetto JSON')
    }

    const navigationSource = isObjectRecord(parsedSection.navigation)
      ? parsedSection.navigation
      : undefined
    const navigationBasePath = navigationSource
      ? readOptionalString(navigationSource.basePath)
      : undefined

    return {
      ...entity,
      id: readStringOrFallback(parsedSection.id, entity.id),
      label: readStringOrFallback(parsedSection.label, entity.label ?? entity.id),
      description: readOptionalString(parsedSection.description),
      objectApiName: readStringOrFallback(
        parsedSection.objectApiName,
        entity.objectApiName ?? '',
      ),
      navigation: navigationBasePath ? { basePath: navigationBasePath } : undefined,
    }
  }

  if (section === 'list') {
    return {
      ...entity,
      list: parsedSection === null ? undefined : (parsedSection as EntityConfig['list']),
    }
  }

  if (section === 'detail') {
    return {
      ...entity,
      detail:
        parsedSection === null
          ? undefined
          : (parsedSection as EntityConfig['detail']),
    }
  }

  return {
    ...entity,
    form: parsedSection === null ? undefined : (parsedSection as EntityConfig['form']),
  }
}

function readStringOrFallback(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback
  }

  return value.trim()
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type BaseFormDraft = {
  id: string
  label: string
  description: string
  objectApiName: string
  basePath: string
}

type BaseFormDraftKey = keyof BaseFormDraft

function createEmptyEntityConfig(): EntityConfig {
  return {
    id: '',
    label: '',
    description: '',
    objectApiName: '',
    navigation: undefined,
    list: undefined,
    detail: undefined,
    form: undefined,
  }
}

function createEmptyBaseFormDraft(): BaseFormDraft {
  return {
    id: '',
    label: '',
    description: '',
    objectApiName: '',
    basePath: '',
  }
}

function createBaseFormDraft(entity: EntityConfig): BaseFormDraft {
  return {
    id: entity.id,
    label: entity.label ?? '',
    description: entity.description ?? '',
    objectApiName: entity.objectApiName ?? '',
    basePath: entity.navigation?.basePath ?? '',
  }
}

function createEntityConfigFromBaseDraft(baseDraft: BaseFormDraft): EntityConfig | null {
  const id = baseDraft.id.trim()
  const label = baseDraft.label.trim()
  const objectApiName = baseDraft.objectApiName.trim()

  if (id.length === 0 || label.length === 0 || objectApiName.length === 0) {
    return null
  }

  if (id === NEW_ENTITY_SENTINEL) {
    return null
  }

  return {
    id,
    label,
    description: baseDraft.description.trim(),
    objectApiName,
    navigation:
      baseDraft.basePath.trim().length > 0
        ? { basePath: baseDraft.basePath.trim() }
        : undefined,
  }
}
