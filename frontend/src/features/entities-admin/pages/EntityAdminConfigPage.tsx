import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useAppDialog } from '../../../components/app-dialog'
import type { EntityConfig } from '../../entities/entity-types'
import {
  createEntityAdminConfig,
  deleteEntityAdminConfig,
  fetchEntityAdminConfig,
  fetchEntityAdminConfigList,
  previewEntityAdminBootstrap,
  searchEntityAdminObjectApiNames,
  updateEntityAdminConfig,
} from '../entity-admin-api'
import type {
  EntityAdminBootstrapPreviewResponse,
  EntityAdminConfigSummary,
  EntityConfigSectionKey,
  SalesforceObjectApiNameSuggestion,
} from '../entity-admin-types'
import {
  buildEntityCatalogPath,
  buildEntityCreatePath,
  buildEntityEditPath,
  buildEntityViewPath,
  ENTITY_CONFIG_SECTION_LABELS,
  type EntityConfigDetailEditorAreaKey,
  type EntityConfigFormEditorAreaKey,
  isEntityConfigDetailEditorArea,
  isEntityConfigEditSessionPath,
  isEntityConfigFormEditorArea,
  NEW_ENTITY_SENTINEL,
  parseEntityConfigEditPath,
} from '../entity-admin-routing'
import { EntityBootstrapPreviewPanel } from '../components/EntityBootstrapPreviewPanel'
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
  detailArea?: string
  formArea?: string
}

type EntityAdminLocationState = {
  saveInfo?: string
}

export function EntityAdminConfigPage() {
  const { confirm } = useAppDialog()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const blockedNavigationKeyRef = useRef<string | null>(null)

  const isCreateRoute = location.pathname === buildEntityCreatePath()
  const activeEditRoute = useMemo(
    () => parseEntityConfigEditPath(location.pathname),
    [location.pathname],
  )
  const selectedEntityId =
    activeEditRoute?.entityId ??
    (params.entityId && params.entityId !== NEW_ENTITY_SENTINEL
      ? decodeURIComponent(params.entityId)
      : null)
  const activeSection = isCreateRoute
    ? 'base'
    : activeEditRoute?.section ??
      (params.detailArea ? 'detail' : params.formArea ? 'form' : null)
  const activeDetailArea = activeEditRoute?.detailArea ?? null
  const activeFormArea = activeEditRoute?.formArea ?? null
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
  const [persistedDraftSnapshot, setPersistedDraftSnapshot] =
    useState<EntityConfigDraftSnapshot | null>(null)
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
  const [bootstrapPreview, setBootstrapPreview] =
    useState<EntityAdminBootstrapPreviewResponse | null>(null)
  const [bootstrapPreviewFingerprint, setBootstrapPreviewFingerprint] = useState<string | null>(
    null,
  )
  const [loadingBootstrapPreview, setLoadingBootstrapPreview] = useState(false)
  const [bootstrapPreviewError, setBootstrapPreviewError] = useState<string | null>(null)
  const [basePathAutoSyncEnabled, setBasePathAutoSyncEnabled] = useState(true)

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

  const hasUnsavedChanges = useMemo(() => {
    if (!isEditRoute || persistedDraftSnapshot === null) {
      return false
    }

    return (
      serializeDraftSnapshot({
        base: baseFormDraft,
        list: listFormDraft,
        detail: detailFormDraft,
        form: formFormDraft,
      }) !== serializeDraftSnapshot(persistedDraftSnapshot)
    )
  }, [
    baseFormDraft,
    detailFormDraft,
    formFormDraft,
    isEditRoute,
    listFormDraft,
    persistedDraftSnapshot,
  ])

  const currentBaseFingerprint = useMemo(
    () => createBaseDraftFingerprint(baseFormDraft),
    [baseFormDraft],
  )
  const hasCurrentBootstrapPreview =
    bootstrapPreview !== null && bootstrapPreviewFingerprint === currentBaseFingerprint

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
    if (!selectedEntityId || !params.detailArea || isEntityConfigDetailEditorArea(params.detailArea)) {
      return
    }

    navigate(buildEntityEditPath(selectedEntityId, 'detail'), { replace: true })
  }, [navigate, params.detailArea, selectedEntityId])

  useEffect(() => {
    if (!selectedEntityId || !params.formArea || isEntityConfigFormEditorArea(params.formArea)) {
      return
    }

    navigate(buildEntityEditPath(selectedEntityId, 'form'), { replace: true })
  }, [navigate, params.formArea, selectedEntityId])

  useEffect(() => {
    if (!selectedEntityConfig) {
      setBaseFormDraft(createEmptyBaseFormDraft())
      setListFormDraft(createEmptyListFormDraft())
      setDetailFormDraft(createEmptyDetailFormDraft())
      setFormFormDraft(createEmptyFormDraft())
      setPersistedDraftSnapshot(null)
      setSelectedListViewIndex(0)
      setObjectApiNameSearchInput('')
      setObjectApiNameSuggestions([])
      setObjectApiNameSuggestionsError(null)
      setBasePathAutoSyncEnabled(isCreateRoute)
      return
    }

    const snapshot = createDraftSnapshot(selectedEntityConfig)
    setBaseFormDraft(snapshot.base)
    setListFormDraft(snapshot.list)
    setDetailFormDraft(snapshot.detail)
    setFormFormDraft(snapshot.form)
    setPersistedDraftSnapshot(snapshot)
    setSelectedListViewIndex(0)
    setObjectApiNameSearchInput('')
    setObjectApiNameSuggestions([])
    setObjectApiNameSuggestionsError(null)
    setBasePathAutoSyncEnabled(isCreateRoute)
  }, [isCreateRoute, selectedEntityConfig])

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
  }, [activeDetailArea, activeFormArea, activeSection, isCreateRoute, isEditRoute, selectedEntityId])

  useEffect(() => {
    const nextSaveInfo = readLocationSaveInfo(location.state)
    if (!nextSaveInfo) {
      return
    }

    setSaveInfo(nextSaveInfo)
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: null,
      },
    )
  }, [location.hash, location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    setBootstrapPreview(null)
    setBootstrapPreviewFingerprint(null)
    setBootstrapPreviewError(null)
    setLoadingBootstrapPreview(false)
  }, [isCreateRoute])

  const shouldBlockDirtyNavigation = useCallback(
    ({
      currentLocation,
      nextLocation,
    }: {
      currentLocation: { pathname: string; search: string; hash: string }
      nextLocation: { pathname: string; search: string; hash: string }
    }) => {
      if (!isEditRoute || !selectedEntityId || !hasUnsavedChanges || saving) {
        return false
      }

      if (
        currentLocation.pathname === nextLocation.pathname &&
        currentLocation.search === nextLocation.search &&
        currentLocation.hash === nextLocation.hash
      ) {
        return false
      }

      return !isEntityConfigEditSessionPath(nextLocation.pathname, selectedEntityId)
    },
    [hasUnsavedChanges, isEditRoute, saving, selectedEntityId],
  )

  const navigationBlocker = useBlocker(shouldBlockDirtyNavigation)

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') {
      blockedNavigationKeyRef.current = null
      return
    }

    const blockedNavigationKey = [
      navigationBlocker.location.pathname,
      navigationBlocker.location.search,
      navigationBlocker.location.hash,
    ].join('')

    if (blockedNavigationKeyRef.current === blockedNavigationKey) {
      return
    }

    blockedNavigationKeyRef.current = blockedNavigationKey

    void confirm({
      title: 'Modifiche non salvate',
      description: 'Hai modifiche non salvate. Vuoi uscire e perderle?',
      confirmLabel: 'Esci senza salvare',
      cancelLabel: 'Resta nella pagina',
      tone: 'danger',
    }).then((shouldLeave) => {
      if (blockedNavigationKeyRef.current !== blockedNavigationKey) {
        return
      }

      blockedNavigationKeyRef.current = null

      if (shouldLeave) {
        navigationBlocker.proceed()
        return
      }

      navigationBlocker.reset()
    })
  }, [confirm, navigationBlocker])

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!isEditRoute || !hasUnsavedChanges || saving) {
          return
        }

        event.preventDefault()
        event.returnValue = ''
      },
      [hasUnsavedChanges, isEditRoute, saving],
    ),
  )

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
    if (field === 'basePath') {
      setBasePathAutoSyncEnabled(false)
    }

    setBaseFormDraft((current) => {
      const nextDraft = {
        ...current,
        [field]: value,
      }

      if (field === 'objectApiName' || field === 'id') {
        const nextObjectApiName = field === 'objectApiName' ? value : current.objectApiName
        const nextEntityId = field === 'id' ? value : current.id

        if (basePathAutoSyncEnabled) {
          nextDraft.basePath = buildSuggestedEntityBasePath(nextEntityId, nextObjectApiName)
        }
      }

      return nextDraft
    })

    if (field === 'objectApiName') {
      setObjectApiNameSearchInput(value)
    }

    setSaveInfo(null)
    setEditorError(null)
    setBootstrapPreviewError(null)
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
      const currentView = nextViews[index]
      const normalizedQueryFields = value
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
      nextViews[index] = {
        ...currentView,
        [field]: value,
      }

      if (field === 'queryFields') {
        const currentColumnsCount = countConfiguredColumns(currentView.columns)

        if (normalizedQueryFields.length === 0) {
          nextViews[index].columns = ''
          nextViews[index].searchFields = []
        } else if (currentColumnsCount === 0) {
          nextViews[index].columns = pickDefaultListColumn(normalizedQueryFields)
        }
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

  const handleSelectDetailArea = useCallback(
    (nextArea: EntityConfigDetailEditorAreaKey) => {
      if (!selectedEntityId) {
        return
      }

      navigate(buildEntityEditPath(selectedEntityId, 'detail', nextArea))
    },
    [navigate, selectedEntityId],
  )

  const handleSelectFormArea = useCallback(
    (nextArea: EntityConfigFormEditorAreaKey) => {
      if (!selectedEntityId) {
        return
      }

      navigate(buildEntityEditPath(selectedEntityId, 'form', nextArea))
    },
    [navigate, selectedEntityId],
  )

  const updateDetailDraft = (nextDraft: DetailFormDraft) => {
    setDetailFormDraft(nextDraft)
    setSaveInfo(null)
    setEditorError(null)
  }

  const generateBootstrapPreview = async () => {
    const nextConfig = createEntityConfigFromBaseDraft(baseFormDraft)

    if (!nextConfig) {
      setEditorError(getBaseDraftValidationMessage(baseFormDraft, 'generare il preset'))
      setBootstrapPreviewError(null)
      return
    }

    setLoadingBootstrapPreview(true)
    setBootstrapPreviewError(null)
    setEditorError(null)
    setPageError(null)

    try {
      const payload = await previewEntityAdminBootstrap(nextConfig)
      setBootstrapPreview(payload)
      setBootstrapPreviewFingerprint(currentBaseFingerprint)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore generazione bootstrap preview'
      setBootstrapPreviewError(message)
    } finally {
      setLoadingBootstrapPreview(false)
    }
  }

  const saveSelectedEntityConfig = async () => {
    if (!selectedEntityConfig) {
      return
    }

    let nextConfig: EntityConfig

    try {
      nextConfig = buildEntityConfigFromDrafts(selectedEntityConfig, {
        base: baseFormDraft,
        list: listFormDraft,
        detail: detailFormDraft,
        form: formFormDraft,
      })
      setEditorError(null)
    } catch (error) {
      const validationError = normalizeDraftValidationError(error)
      setPageError(null)
      setSaveInfo(null)
      setEditorError(validationError.message)

      if (selectedEntityId && validationError.section !== activeSection) {
        navigate(buildEntityEditPath(selectedEntityId, validationError.section))
      }
      return
    }

    setSaving(true)
    setSaveInfo(null)
    setPageError(null)
    setEditorError(null)

    try {
      const payload = await updateEntityAdminConfig(selectedEntityConfig.id, nextConfig)
      setSelectedEntityConfig(payload.entity)
      setAclResourceConfigured(payload.aclResourceConfigured)
      setSaveInfo('Configurazione salvata')
      navigate(
        buildEntityEditPathForSection(
          payload.entity.id,
          activeSection ?? 'base',
          activeDetailArea,
          activeFormArea,
        ),
        { replace: true },
      )
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
      setEditorError(getBaseDraftValidationMessage(baseFormDraft, 'creare'))
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
      await refreshEntityList()
      navigate(buildEntityEditPath(payload.entity.id, 'base'), {
        replace: true,
        state: {
          saveInfo: 'Entity creata',
        } satisfies EntityAdminLocationState,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore creazione entity config'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const createNewEntityFromBootstrapPreview = async () => {
    if (!bootstrapPreview || !hasCurrentBootstrapPreview) {
      setBootstrapPreviewError(
        'Rigenera la preview prima di creare la entity con preset.',
      )
      return
    }

    setSaving(true)
    setSaveInfo(null)
    setPageError(null)
    setEditorError(null)
    setBootstrapPreviewError(null)

    try {
      const payload = await createEntityAdminConfig(bootstrapPreview.entity)
      setSelectedEntityConfig(payload.entity)
      setAclResourceConfigured(payload.aclResourceConfigured)
      await refreshEntityList()
      navigate(buildEntityEditPath(payload.entity.id, 'list'), {
        replace: true,
        state: {
          saveInfo: 'Preset applicato, rivedi list/detail/form e configura ACL.',
        } satisfies EntityAdminLocationState,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore creazione entity con preset'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const removeSelectedEntityConfig = async () => {
    if (!selectedEntityId) {
      return
    }

    const confirmed = await confirm({
      title: 'Elimina entity',
      description: `Eliminare la entity ${selectedEntityId}?`,
      confirmLabel: 'Elimina',
      cancelLabel: 'Annulla',
      tone: 'danger',
    })
    if (!confirmed) {
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
            <div className="flex flex-wrap items-center gap-2">
              {hasUnsavedChanges ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">
                  Modifiche non salvate
                </span>
              ) : null}
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
          <EntityBootstrapPreviewPanel
            preview={bootstrapPreview}
            previewCurrent={hasCurrentBootstrapPreview}
            previewLoading={loadingBootstrapPreview}
            previewError={bootstrapPreviewError}
            saving={saving}
            onGeneratePreview={() => {
              void generateBootstrapPreview()
            }}
            onCreateWithPreset={() => createNewEntityFromBootstrapPreview()}
            onCreateBaseOnly={() => saveNewEntityConfig()}
          />

          <EntityConfigBaseForm
            value={baseFormDraft}
            error={editorError}
            onChange={updateBaseDraftField}
            suggestions={objectApiNameSuggestions}
            suggestionsLoading={loadingObjectApiNameSuggestions}
            suggestionsError={objectApiNameSuggestionsError}
            showSuggestions={shouldShowObjectApiNameSuggestions}
            onSelectSuggestion={selectObjectApiNameSuggestion}
            eyebrow="Create"
            title="Nuova entity"
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
              disableIdField
              idHelperText="L'entity id è immutabile dopo la creazione."
            />
          ) : activeSection === 'list' ? (
            <EntityConfigListForm
              value={listFormDraft}
              error={editorError}
              baseObjectApiName={baseFormDraft.objectApiName}
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
            />
          ) : activeSection === 'detail' ? (
            <EntityConfigDetailForm
              value={detailFormDraft}
              error={editorError}
              baseObjectApiName={baseFormDraft.objectApiName}
              activeArea={activeDetailArea ?? 'header-query'}
              onChange={updateDetailDraft}
              onAreaChange={handleSelectDetailArea}
            />
          ) : (
            <EntityConfigFormForm
              value={formFormDraft}
              error={editorError}
              baseObjectApiName={baseFormDraft.objectApiName}
              activeArea={activeFormArea ?? 'header-query'}
              onChange={setFormFormDraft}
              onAreaChange={handleSelectFormArea}
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

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
type BaseFormDraft = {
  id: string
  label: string
  description: string
  objectApiName: string
  basePath: string
}

type BaseFormDraftKey = keyof BaseFormDraft

type EntityConfigDraftSnapshot = {
  base: BaseFormDraft
  list: ListFormDraft
  detail: DetailFormDraft
  form: FormFormDraft
}

class EntityConfigDraftValidationError extends Error {
  section: EntityConfigSectionKey

  constructor(section: EntityConfigSectionKey, message: string) {
    super(message)
    this.name = 'EntityConfigDraftValidationError'
    this.section = section
  }
}

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

function createBaseDraftFingerprint(baseDraft: BaseFormDraft): string {
  return JSON.stringify({
    id: baseDraft.id.trim(),
    label: baseDraft.label.trim(),
    description: baseDraft.description.trim(),
    objectApiName: baseDraft.objectApiName.trim(),
    basePath: baseDraft.basePath.trim(),
  })
}

function toSuggestedEntityId(rawValue: string): string {
  return rawValue
    .trim()
    .replace(/__(c|r)$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildSuggestedEntityBasePath(entityId: string, objectApiName: string): string {
  const normalizedEntityId = toSuggestedEntityId(entityId)
  const normalizedObjectApiName = toSuggestedEntityId(objectApiName)
  const pathId = normalizedEntityId || normalizedObjectApiName

  if (!pathId) {
    return ''
  }

  return `/s/${pathId}`
}

function countConfiguredColumns(columnsDraft: string): number {
  return columnsDraft
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0).length
}

function pickDefaultListColumn(queryFields: string[]): string {
  const preferred = queryFields.find((field) => field === 'Name')
  return preferred ?? queryFields[0] ?? 'Id'
}

function readLocationSaveInfo(state: unknown): string | null {
  if (!state || typeof state !== 'object') {
    return null
  }

  const value = (state as EntityAdminLocationState).saveInfo
  return typeof value === 'string' && value.trim().length > 0 ? value : null
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
    description: readOptionalString(baseDraft.description),
    objectApiName,
    navigation:
      baseDraft.basePath.trim().length > 0
        ? { basePath: baseDraft.basePath.trim() }
        : undefined,
  }
}

function createDraftSnapshot(entity: EntityConfig): EntityConfigDraftSnapshot {
  return {
    base: createBaseFormDraft(entity),
    list: createListFormDraft(entity.list),
    detail: createDetailFormDraft(entity.detail),
    form: createFormDraft(entity.form),
  }
}

function serializeDraftSnapshot(snapshot: EntityConfigDraftSnapshot): string {
  return JSON.stringify(snapshot)
}

function buildEntityConfigFromDrafts(
  persistedEntity: EntityConfig,
  drafts: EntityConfigDraftSnapshot,
): EntityConfig {
  const baseConfig = createEntityConfigFromBaseDraft(drafts.base)
  if (!baseConfig) {
    throw new EntityConfigDraftValidationError(
      'base',
      getPrefixedSectionMessage('base', getBaseDraftValidationMessage(drafts.base, 'salvare')),
    )
  }

  const baseObjectApiName = baseConfig.objectApiName ?? ''
  const list =
    persistedEntity.list !== undefined || !isListFormDraftEmpty(drafts.list)
      ? parseDraftSection('list', () => parseListFormDraft(drafts.list, baseObjectApiName))
      : undefined
  const detail =
    persistedEntity.detail !== undefined || !isDetailFormDraftEmpty(drafts.detail)
      ? parseDraftSection('detail', () => parseDetailFormDraft(drafts.detail, baseObjectApiName))
      : undefined
  const form =
    persistedEntity.form !== undefined || !isFormFormDraftEmpty(drafts.form)
      ? parseDraftSection('form', () => parseFormDraft(drafts.form, baseObjectApiName))
      : undefined

  return {
    ...baseConfig,
    list,
    detail,
    form,
  }
}

function parseDraftSection<T>(
  section: EntityConfigSectionKey,
  parser: () => T,
): T {
  try {
    return parser()
  } catch (error) {
    const fallback = `Valori form non validi per la sezione ${ENTITY_CONFIG_SECTION_LABELS[section]}`
    throw new EntityConfigDraftValidationError(
      section,
      getPrefixedSectionMessage(
        section,
        error instanceof Error ? error.message : fallback,
      ),
    )
  }
}

function normalizeDraftValidationError(error: unknown): EntityConfigDraftValidationError {
  if (error instanceof EntityConfigDraftValidationError) {
    return error
  }

  return new EntityConfigDraftValidationError(
    'base',
    getPrefixedSectionMessage(
      'base',
      error instanceof Error ? error.message : 'Valori form non validi',
    ),
  )
}

function getBaseDraftValidationMessage(
  baseDraft: BaseFormDraft,
  action: 'creare' | 'salvare' | 'generare il preset',
): string {
  if (baseDraft.id.trim() === NEW_ENTITY_SENTINEL) {
    return `Entity Id non puo essere ${NEW_ENTITY_SENTINEL}`
  }

  return `Compila id, label e objectApiName per ${action} la entity`
}

function getPrefixedSectionMessage(
  section: EntityConfigSectionKey,
  message: string,
): string {
  const sectionLabel = ENTITY_CONFIG_SECTION_LABELS[section]
  const normalizedMessage = message.trim().toLowerCase()
  const normalizedLabel = sectionLabel.toLowerCase()
  const normalizedPrefix = `sezione ${normalizedLabel}`

  if (
    normalizedMessage.startsWith(normalizedPrefix) ||
    normalizedMessage.startsWith(`${normalizedLabel}:`) ||
    normalizedMessage.startsWith(`${normalizedLabel} `)
  ) {
    return message
  }

  return `Sezione ${sectionLabel}: ${message}`
}

function isListFormDraftEmpty(draft: ListFormDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(createEmptyListFormDraft())
}

function isDetailFormDraftEmpty(draft: DetailFormDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(createEmptyDetailFormDraft())
}

function isFormFormDraftEmpty(draft: FormFormDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(createEmptyFormDraft())
}

function buildEntityEditPathForSection(
  entityId: string,
  section: EntityConfigSectionKey,
  detailArea: EntityConfigDetailEditorAreaKey | null,
  formArea: EntityConfigFormEditorAreaKey | null,
): string {
  if (section === 'detail') {
    return buildEntityEditPath(entityId, 'detail', detailArea ?? undefined)
  }

  if (section === 'form') {
    return buildEntityEditPath(entityId, 'form', formArea ?? undefined)
  }

  return buildEntityEditPath(entityId, section)
}
