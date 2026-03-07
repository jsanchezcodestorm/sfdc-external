import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import type { EntityConfig } from '../../entities/entity-types'
import {
  createEntityAdminConfig,
  deleteEntityAdminConfig,
  fetchEntityAdminConfig,
  fetchEntityAdminConfigList,
  searchEntityAdminObjectApiNames,
  updateEntityAdminConfig,
} from '../entity-admin-api'
import type {
  EntityAdminConfigSummary,
  EntityConfigSectionKey,
  SalesforceObjectApiNameSuggestion,
} from '../entity-admin-types'
import {
  buildEntityCatalogPath,
  buildEntityCreatePath,
  buildEntityEditPath,
  buildEntityViewPath,
  isEntityConfigSection,
  NEW_ENTITY_SENTINEL,
} from '../entity-admin-routing'
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

type RouteParams = {
  entityId?: string
  section?: string
}

export function EntityAdminConfigPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<RouteParams>()

  const isCreateRoute = location.pathname === buildEntityCreatePath()
  const selectedEntityId =
    params.entityId && params.entityId !== NEW_ENTITY_SENTINEL
      ? decodeURIComponent(params.entityId)
      : null
  const activeSection = isCreateRoute
    ? 'base'
    : isEntityConfigSection(params.section)
    ? params.section
    : null
  const isEditRoute = Boolean(selectedEntityId) && activeSection !== null
  const isEntityListRoute = selectedEntityId === null && !isCreateRoute
  const isViewRoute = Boolean(selectedEntityId) && !isEditRoute

  const [entities, setEntities] = useState<EntityAdminConfigSummary[]>([])
  const [selectedEntityConfig, setSelectedEntityConfig] = useState<EntityConfig | null>(null)
  const [baseFormDraft, setBaseFormDraft] = useState<BaseFormDraft>(createEmptyBaseFormDraft())
  const [listFormDraft, setListFormDraft] = useState<ListFormDraft>(createEmptyListFormDraft())
  const [detailFormDraft, setDetailFormDraft] = useState<DetailFormDraft>(
    createEmptyDetailFormDraft(),
  )
  const [formFormDraft, setFormFormDraft] = useState<FormFormDraft>(createEmptyFormDraft())
  const [selectedListViewIndex, setSelectedListViewIndex] = useState(0)
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
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)
  const [aclResourceConfigured, setAclResourceConfigured] = useState(true)

  const selectedEntitySummary = useMemo(
    () => entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [entities, selectedEntityId],
  )

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

  const refreshEntityList = useCallback(async () => {
    setLoadingList(true)

    try {
      const payload = await fetchEntityAdminConfigList()
      const nextItems = payload.items ?? []
      setEntities(nextItems)
      setPageError(null)

      if (!isCreateRoute && selectedEntityId && !nextItems.some((item) => item.id === selectedEntityId)) {
        navigate(buildEntityCatalogPath(), { replace: true })
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
  }, [isCreateRoute, navigate, selectedEntityId])

  const loadSelectedEntityConfig = useCallback(async () => {
    if (isCreateRoute) {
      setSelectedEntityConfig(createEmptyEntityConfig())
      setAclResourceConfigured(false)
      setLoadingConfig(false)
      setPageError(null)
      return
    }

    if (!selectedEntityId) {
      setSelectedEntityConfig(null)
      setAclResourceConfigured(true)
      return
    }

    setLoadingConfig(true)
    try {
      const payload = await fetchEntityAdminConfig(selectedEntityId)
      setSelectedEntityConfig(payload.entity)
      setAclResourceConfigured(payload.aclResourceConfigured)
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
    if (params.entityId !== NEW_ENTITY_SENTINEL || isCreateRoute) {
      return
    }

    navigate(buildEntityCreatePath(), { replace: true })
  }, [isCreateRoute, navigate, params.entityId])

  useEffect(() => {
    if (!selectedEntityId || !params.section || activeSection !== null) {
      return
    }

    navigate(buildEntityEditPath(selectedEntityId, 'base'), { replace: true })
  }, [activeSection, navigate, params.section, selectedEntityId])

  useEffect(() => {
    if (!selectedEntityConfig) {
      setBaseFormDraft(createEmptyBaseFormDraft())
      setListFormDraft(createEmptyListFormDraft())
      setDetailFormDraft(createEmptyDetailFormDraft())
      setFormFormDraft(createEmptyFormDraft())
      setSelectedListViewIndex(0)
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
    setObjectApiNameSearchInput('')
    setObjectApiNameSuggestions([])
    setObjectApiNameSuggestionsError(null)
  }, [selectedEntityConfig])

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
  }, [activeSection, isCreateRoute, isEditRoute, selectedEntityId])

  const canSearchObjectApiNameSuggestions =
    (isCreateRoute || isEditRoute) && activeSection === 'base' && selectedEntityConfig !== null
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
            error instanceof Error ? error.message : 'Errore ricerca object Salesforce'
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

  const handleSelectEntity = useCallback(
    (entityId: string) => {
      navigate(buildEntityViewPath(entityId))
    },
    [navigate],
  )

  const handleCreateEntity = useCallback(() => {
    navigate(buildEntityCreatePath())
  }, [navigate])

  const handleBackToEntityList = useCallback(() => {
    navigate(buildEntityCatalogPath())
  }, [navigate])

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
      const payload = await updateEntityAdminConfig(
        selectedEntityConfig.id,
        selectedEntityConfig,
      )
      setSelectedEntityConfig(payload.entity)
      setAclResourceConfigured(payload.aclResourceConfigured)
      setSaveInfo('Configurazione salvata')
      navigate(buildEntityEditPath(payload.entity.id, activeSection ?? 'base'), { replace: true })
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
      const payload = await createEntityAdminConfig(nextConfig)
      setSelectedEntityConfig(payload.entity)
      setAclResourceConfigured(payload.aclResourceConfigured)
      setSaveInfo('Entity creata')
      await refreshEntityList()
      navigate(buildEntityEditPath(payload.entity.id, 'base'), { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore creazione entity config'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const removeSelectedEntityConfig = async () => {
    if (!selectedEntityId || !window.confirm(`Eliminare la entity ${selectedEntityId}?`)) {
      return
    }

    setDeleting(true)
    setPageError(null)
    setSaveInfo(null)

    try {
      await deleteEntityAdminConfig(selectedEntityId)
      await refreshEntityList()
      navigate(buildEntityCatalogPath(), { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore eliminazione entity config'
      setPageError(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Admin
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              Entity Config
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {isCreateRoute
                ? 'Creazione di una nuova entity con pagina dedicata.'
                : isEntityListRoute
                ? 'Catalogo tabellare delle entity configurate.'
                : isEditRoute
                ? 'Editing dedicato della entity selezionata.'
                : 'View readonly della entity selezionata.'}
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
          ) : isViewRoute && selectedEntityId ? (
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
                onClick={() => navigate(buildEntityEditPath(selectedEntityId, 'base'))}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Modifica
              </button>
              <button
                type="button"
                onClick={() => {
                  void removeSelectedEntityConfig()
                }}
                disabled={deleting}
                className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {deleting ? 'Eliminazione...' : 'Elimina'}
              </button>
            </div>
          ) : isEditRoute && selectedEntityId ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate(buildEntityViewPath(selectedEntityId))}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                View entity
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveSelectedEntityConfig()
                }}
                disabled={!selectedEntityConfig || saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {saving ? 'Salvataggio...' : 'Salva entity'}
              </button>
            </div>
          ) : null}
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

      {loadingList ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Caricamento entity admin list...</p>
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
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">
              In creazione iniziale e disponibile solo la sezione Base. Dopo il primo save, la
              navigazione passa all&apos;editor completo della nuova entity.
            </p>
          </section>

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
            eyebrow="Create"
            title="Nuova entity"
            showApplyButton={false}
          />
        </>
      ) : null}

      {isViewRoute && selectedEntitySummary ? (
        <>
          <EntitySummaryCard
            summary={selectedEntitySummary}
            entity={selectedEntityConfig}
            aclResourceConfigured={aclResourceConfigured}
          />
        </>
      ) : null}

      {loadingConfig ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Caricamento configurazione entity...</p>
        </section>
      ) : null}

      {!loadingConfig && isEditRoute && selectedEntityConfig ? (
        <>
          {!aclResourceConfigured ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <p className="text-sm text-amber-800">
                Risorsa ACL mancante: <code className="font-mono">entity:{selectedEntityConfig.id}</code>.
                Configurala nel modulo ACL Admin per rendere coerente accesso e navigazione.
              </p>
            </section>
          ) : null}

          {activeSection === 'base' ? (
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
              disableIdField
              idHelperText="L'entity id è immutabile dopo la creazione."
            />
          ) : activeSection === 'list' ? (
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
          ) : activeSection === 'detail' ? (
            <EntityConfigDetailForm
              value={detailFormDraft}
              error={editorError}
              baseObjectApiName={selectedEntityConfig.objectApiName ?? ''}
              onChange={updateDetailDraft}
              onApply={applyDetailDraft}
            />
          ) : (
            <EntityConfigFormForm
              value={formFormDraft}
              error={editorError}
              baseObjectApiName={selectedEntityConfig.objectApiName ?? ''}
              onChange={setFormFormDraft}
              onApply={applyFormDraft}
            />
          )}
        </>
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
            Tabella amministrativa con view ed edit su pagine dedicate.
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
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Id</th>
                <th className="px-4 py-3 text-left">Label</th>
                <th className="px-4 py-3 text-left">Object API Name</th>
                <th className="px-4 py-3 text-left">ACL</th>
                <th className="px-4 py-3 text-left">List</th>
                <th className="px-4 py-3 text-left">Detail</th>
                <th className="px-4 py-3 text-left">Form</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entities.length > 0 ? (
                entities.map((entity) => (
                  <tr key={entity.id} className="bg-white">
                    <td className="px-4 py-3 font-semibold text-slate-900">{entity.id}</td>
                    <td className="px-4 py-3 text-slate-700">{entity.label}</td>
                    <td className="px-4 py-3 text-slate-700">{entity.objectApiName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {entity.aclResourceConfigured ? 'Configurata' : 'Missing'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entity.viewCount}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {entity.detailSectionCount}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entity.formSectionCount}</td>
                    <td className="px-4 py-3 text-slate-700">{formatTimestamp(entity.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectEntity(entity.id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-sm text-slate-500">
                    {query.trim().length > 0
                      ? 'Nessuna entità corrisponde al filtro.'
                      : 'Nessuna entità disponibile.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function EntitySummaryCard({
  summary,
  entity,
  aclResourceConfigured,
}: {
  summary: EntityAdminConfigSummary
  entity: EntityConfig | null
  aclResourceConfigured: boolean
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            View
          </p>
          <h2 className="text-xl font-semibold text-slate-900">{summary.label}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {summary.id} - {summary.objectApiName}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <SummaryChip label="Views" value={summary.viewCount} />
        <SummaryChip label="Detail Sections" value={summary.detailSectionCount} />
        <SummaryChip label="Related Lists" value={summary.relatedListCount} />
        <SummaryChip label="Form Sections" value={summary.formSectionCount} />
      </div>

      {!aclResourceConfigured ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Risorsa ACL mancante: <code className="font-mono">entity:{summary.id}</code>.
          Configurala nel modulo ACL Admin per rendere coerente accesso e navigazione.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ReadonlyBlock label="Description">{entity?.description || '-'}</ReadonlyBlock>
        <ReadonlyBlock label="Navigation Base Path">
          {entity?.navigation?.basePath || '-'}
        </ReadonlyBlock>
        <ReadonlyBlock label="List Config">
          {summary.hasList ? 'Configurata' : 'Assente'}
        </ReadonlyBlock>
        <ReadonlyBlock label="Detail Config">
          {summary.hasDetail ? 'Configurata' : 'Assente'}
        </ReadonlyBlock>
        <ReadonlyBlock label="Form Config">
          {summary.hasForm ? 'Configurata' : 'Assente'}
        </ReadonlyBlock>
        <ReadonlyBlock label="Updated">{formatTimestamp(summary.updatedAt)}</ReadonlyBlock>
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

function ReadonlyBlock({ label, children }: { label: string; children: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm text-slate-700">{children}</p>
    </article>
  )
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
