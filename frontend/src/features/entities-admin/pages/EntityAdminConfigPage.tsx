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
import { EntityAdminSidebar } from '../components/EntityAdminSidebar'
import { EntityConfigBaseForm } from '../components/EntityConfigBaseForm'
import { EntityConfigDetailForm } from '../components/EntityConfigDetailForm'
import {
  createDetailFormDraft,
  createEmptyDetailFormDraft,
  parseDetailFormDraft,
} from '../components/detail-form/detail-form.mapper'
import type { DetailFormDraft } from '../components/detail-form/detail-form.types'
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

type AdminRouteParams = {
  entityId?: string
  section?: string
}

export function EntityAdminConfigPage() {
  const navigate = useNavigate()
  const params = useParams<AdminRouteParams>()

  const selectedEntityId = normalizeEntityIdParam(params.entityId)
  const selectedSection = normalizeSectionParam(params.section)

  const [entities, setEntities] = useState<EntityAdminConfigSummary[]>([])
  const [selectedEntityConfig, setSelectedEntityConfig] = useState<EntityConfig | null>(null)
  const [baseFormDraft, setBaseFormDraft] = useState<BaseFormDraft>(createEmptyBaseFormDraft())
  const [listFormDraft, setListFormDraft] = useState<ListFormDraft>(createEmptyListFormDraft())
  const [detailFormDraft, setDetailFormDraft] = useState<DetailFormDraft>(
    createEmptyDetailFormDraft(),
  )
  const [selectedListViewIndex, setSelectedListViewIndex] = useState(0)
  const [sectionDraft, setSectionDraft] = useState('')
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

  const hashPath = selectedEntityId
    ? buildAdminPath(selectedEntityId, selectedSection)
    : '/admin/entity-config'

  const navigateToEntitySection = useCallback(
    (entityId: string, section: EntityConfigSectionKey, replace = false) => {
      navigate(buildAdminPath(entityId, section), { replace })
    },
    [navigate],
  )

  const refreshEntityList = useCallback(async () => {
    setLoadingList(true)

    try {
      const payload = await fetchEntityAdminConfigList()
      const nextItems = payload.items ?? []
      setEntities(nextItems)
      setPageError(null)

      if (nextItems.length === 0) {
        setSelectedEntityConfig(null)

        if (selectedEntityId || params.section) {
          navigate('/admin/entity-config', { replace: true })
        }

        return
      }

      const hasSelectedEntity =
        selectedEntityId !== null &&
        nextItems.some((item) => item.id === selectedEntityId)
      const targetEntityId = hasSelectedEntity
        ? selectedEntityId
        : nextItems[0].id

      if (!selectedEntityId || !hasSelectedEntity || params.section !== selectedSection) {
        navigateToEntitySection(targetEntityId, selectedSection, true)
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
    navigateToEntitySection,
    params.section,
    selectedEntityId,
    selectedSection,
  ])

  const loadSelectedEntityConfig = useCallback(async () => {
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
  }, [selectedEntityId])

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
    setSelectedListViewIndex(0)

    if (
      selectedSection === 'base' ||
      selectedSection === 'list' ||
      selectedSection === 'detail'
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

  const handleSelectEntity = (entityId: string) => {
    navigateToEntitySection(entityId, selectedSection)
  }

  const handleSelectSection = (section: EntityConfigSectionKey) => {
    if (selectedEntityId) {
      navigateToEntitySection(selectedEntityId, section)
      return
    }

    if (entities.length > 0) {
      navigateToEntitySection(entities[0].id, section)
    }
  }

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
      setSaveInfo('Configurazione salvata su PostgreSQL')
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

  useEffect(() => {
    setSelectedListViewIndex((current) => {
      if (listFormDraft.views.length === 0) {
        return 0
      }

      const maxIndex = listFormDraft.views.length - 1
      return current > maxIndex ? maxIndex : current
    })
  }, [listFormDraft.views.length])

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
    <div className="relative min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <div className="hidden lg:block">
        <div className="fixed left-0 top-[57px] h-[calc(100vh-57px)] w-80">
          <EntityAdminSidebar
            entities={entities}
            selectedEntityId={selectedEntityId}
            selectedSection={selectedSection}
            onSelectEntity={handleSelectEntity}
            onSelectSection={handleSelectSection}
          />
        </div>
      </div>

      <main className="min-h-screen px-4 py-6 sm:px-6 lg:pl-[21rem]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Admin
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              Entity Config PostgreSQL
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Sidebar a category e sub category persistenti in hash path.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Path: <code className="font-mono">#{hashPath}</code>
            </p>
          </header>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Entity
              <select
                value={selectedEntityId ?? ''}
                onChange={(event) => {
                  const nextId = event.target.value.trim()
                  if (nextId.length > 0) {
                    handleSelectEntity(nextId)
                  }
                }}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                {entities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} ({item.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Sezione
              <select
                value={selectedSection}
                onChange={(event) =>
                  handleSelectSection(event.target.value as EntityConfigSectionKey)
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                {Object.entries(sectionLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </section>

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

          {!loadingList && !pageError && !selectedEntitySummary ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-600">
                Nessuna entity configurata in PostgreSQL.
              </p>
            </section>
          ) : null}

          {selectedEntitySummary ? (
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
              />
            ) : selectedSection === 'list' ? (
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
            ) : selectedSection === 'detail' ? (
              <EntityConfigDetailForm
                value={detailFormDraft}
                error={editorError}
                baseObjectApiName={selectedEntityConfig.objectApiName ?? ''}
                onChange={updateDetailDraft}
                onApply={applyDetailDraft}
              />
            ) : (
              <EntityConfigSectionEditor
                section={selectedSection}
                value={sectionDraft}
                error={editorError}
                onChange={setSectionDraft}
                onApply={applySectionDraft}
              />
            )
          ) : null}
        </div>
      </main>
    </div>
  )
}

type SummaryChipProps = {
  label: string
  value: number
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

function normalizeEntityIdParam(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSectionParam(value: string | undefined): EntityConfigSectionKey {
  return isSectionKey(value) ? value : 'base'
}

function buildAdminPath(entityId: string, section: EntityConfigSectionKey): string {
  return `/admin/entity-config/${encodeURIComponent(entityId)}/${section}`
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
