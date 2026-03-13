import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useBeforeUnload, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useAppDialog } from '../../../components/app-dialog'
import {
  formatAclResourceAccessMode,
  formatAclResourceSyncState,
  isAclResourceOperational,
  type AclResourceStatus,
} from '../../../lib/acl-resource-status'
import { AclResourceStatusNotice } from '../../../components/AclResourceStatusNotice'
import {
  fetchAclPermissions,
  fetchAclResource,
  updateAclResource,
} from '../../acl-admin/acl-admin-api'
import type { AclAdminPermissionSummary } from '../../acl-admin/acl-admin-types'
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

type EntityCreationWizardStep = 'identity' | 'bootstrap' | 'actions' | 'access' | 'review'

type EntityCreationAclDraft = {
  accessMode: 'disabled' | 'authenticated' | 'permission-bound'
  permissionCodes: string[]
}

export function EntityAdminConfigPage() {
  const { confirm, alert } = useAppDialog()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const blockedNavigationKeyRef = useRef<string | null>(null)
  const pageErrorRef = useRef<HTMLElement | null>(null)
  const editorErrorRef = useRef<HTMLElement | null>(null)
  const bootstrapErrorRef = useRef<HTMLElement | null>(null)
  const shouldAutoSyncIdRef = useRef(true)
  const shouldAutoSyncLabelRef = useRef(true)

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
  const [aclResourceStatus, setAclResourceStatus] = useState<AclResourceStatus | null>(null)
  const [bootstrapPreview, setBootstrapPreview] =
    useState<EntityAdminBootstrapPreviewResponse | null>(null)
  const [bootstrapPreviewFingerprint, setBootstrapPreviewFingerprint] = useState<string | null>(
    null,
  )
  const [loadingBootstrapPreview, setLoadingBootstrapPreview] = useState(false)
  const [bootstrapPreviewError, setBootstrapPreviewError] = useState<string | null>(null)
  const [basePathAutoSyncEnabled, setBasePathAutoSyncEnabled] = useState(true)
  const [creationWizardStep, setCreationWizardStep] =
    useState<EntityCreationWizardStep>('identity')
  const [creationAclDraft, setCreationAclDraft] = useState<EntityCreationAclDraft>({
    accessMode: 'permission-bound',
    permissionCodes: [],
  })
  const [aclPermissionOptions, setAclPermissionOptions] = useState<AclAdminPermissionSummary[]>([])
  const [loadingAclPermissionOptions, setLoadingAclPermissionOptions] = useState(false)
  const [aclPermissionOptionsError, setAclPermissionOptionsError] = useState<string | null>(null)

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
  const canCreateBaseEntity = createEntityConfigFromBaseDraft(baseFormDraft) !== null
  const listStructureError = useMemo(
    () => getDraftSectionValidationMessage('list', listFormDraft, baseFormDraft.objectApiName),
    [baseFormDraft.objectApiName, listFormDraft],
  )
  const detailStructureError = useMemo(
    () => getDraftSectionValidationMessage('detail', detailFormDraft, baseFormDraft.objectApiName),
    [baseFormDraft.objectApiName, detailFormDraft],
  )
  const formStructureError = useMemo(
    () => getDraftSectionValidationMessage('form', formFormDraft, baseFormDraft.objectApiName),
    [baseFormDraft.objectApiName, formFormDraft],
  )
  const hasGeneratedStructure =
    listStructureError === null &&
    detailStructureError === null &&
    formStructureError === null
  const listRowActions = useMemo(
    () => readEntityActionDrafts(listFormDraft.views[0]?.rowActionsJson ?? ''),
    [listFormDraft.views],
  )
  const detailActions = useMemo(
    () => readEntityActionDrafts(detailFormDraft.actionsJson),
    [detailFormDraft.actionsJson],
  )
  const actionsReady = listRowActions.length > 0 || detailActions.length > 0
  const accessReady =
    creationAclDraft.accessMode === 'authenticated' ||
    creationAclDraft.accessMode === 'disabled' ||
    (creationAclDraft.accessMode === 'permission-bound' &&
      creationAclDraft.permissionCodes.length > 0)

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
      setAclResourceStatus(null)
      setLoadingConfig(false)
      setPageError(null)
      return
    }

    if (!selectedEntityId) {
      setSelectedEntityConfig(null)
      setAclResourceStatus(null)
      return
    }

    setLoadingConfig(true)
    try {
      const payload = await fetchEntityAdminConfig(selectedEntityId)
      setSelectedEntityConfig(payload.entity)
      setAclResourceStatus(payload.aclResourceStatus)
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
      shouldAutoSyncIdRef.current = isCreateRoute
      shouldAutoSyncLabelRef.current = isCreateRoute
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
    shouldAutoSyncIdRef.current = isCreateRoute
    shouldAutoSyncLabelRef.current = isCreateRoute
    if (isCreateRoute) {
      setCreationAclDraft((current) => ({
        accessMode: 'permission-bound',
        permissionCodes:
          current.permissionCodes.length > 0
            ? current.permissionCodes
            : selectSuggestedPortalPermissionCodes(aclPermissionOptions),
      }))
    }
  }, [aclPermissionOptions, isCreateRoute, selectedEntityConfig])

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

  useEffect(() => {
    if (!isCreateRoute) {
      return
    }

    setCreationWizardStep('identity')
  }, [isCreateRoute])

  useEffect(() => {
    if (!isCreateRoute) {
      setAclPermissionOptions([])
      setAclPermissionOptionsError(null)
      setLoadingAclPermissionOptions(false)
      return
    }

    let cancelled = false
    setLoadingAclPermissionOptions(true)
    setAclPermissionOptionsError(null)

    void fetchAclPermissions()
      .then((payload) => {
        if (cancelled) {
          return
        }

        const nextOptions = payload.items ?? []
        setAclPermissionOptions(nextOptions)
        setCreationAclDraft((current) => {
          if (current.permissionCodes.length > 0) {
            return current
          }

          const suggestedPermissionCodes = selectSuggestedPortalPermissionCodes(nextOptions)
          return {
            ...current,
            permissionCodes: suggestedPermissionCodes,
          }
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento ACL permissions'
        setAclPermissionOptions([])
        setAclPermissionOptionsError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAclPermissionOptions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isCreateRoute])

  useEffect(() => {
    const focusError = (node: HTMLElement | null) => {
      if (!node) {
        return
      }

      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      node.focus({ preventScroll: true })
    }

    if (pageError) {
      focusError(pageErrorRef.current)
      return
    }

    if (editorError) {
      focusError(editorErrorRef.current)
      return
    }

    if (bootstrapPreviewError && isCreateRoute) {
      focusError(bootstrapErrorRef.current)
    }
  }, [bootstrapPreviewError, editorError, isCreateRoute, pageError])

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
    if (field === 'id') {
      shouldAutoSyncIdRef.current = value.trim().length === 0
    }
    if (field === 'label') {
      shouldAutoSyncLabelRef.current = value.trim().length === 0
    }

    setBaseFormDraft((current) => {
      const nextDraft = {
        ...current,
        [field]: value,
      }

      if (field === 'objectApiName') {
        const suggestedId = value.trim()
        if (
          suggestedId.length > 0 &&
          (current.id.trim().length === 0 || shouldAutoSyncIdRef.current)
        ) {
          nextDraft.id = suggestedId
          shouldAutoSyncIdRef.current = true
        }
        if (
          suggestedId.length > 0 &&
          (current.label.trim().length === 0 || shouldAutoSyncLabelRef.current)
        ) {
          nextDraft.label = buildEntityLabelFromObjectApiName(suggestedId)
          shouldAutoSyncLabelRef.current = true
        }
      }

      if (field === 'objectApiName' || field === 'id') {
        const nextObjectApiName = field === 'objectApiName' ? value : current.objectApiName
        const nextEntityId =
          field === 'id' ? value : field === 'objectApiName' ? nextDraft.id : current.id

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
      await alert({
        title: 'Errore generazione preset',
        description: message,
        tone: 'danger',
        confirmLabel: 'Chiudi',
      })
    } finally {
      setLoadingBootstrapPreview(false)
    }
  }

  const applyBootstrapPreviewToDrafts = () => {
    if (!bootstrapPreview || !hasCurrentBootstrapPreview) {
      setBootstrapPreviewError('Genera un preset aggiornato prima di applicarlo.')
      return
    }

    const snapshot = createDraftSnapshot(bootstrapPreview.entity)
    setListFormDraft(snapshot.list)
    setDetailFormDraft(snapshot.detail)
    setFormFormDraft(snapshot.form)
    setSelectedListViewIndex(0)
    setSaveInfo('Preset standard applicato al wizard')
    setEditorError(null)
    setBootstrapPreviewError(null)
    setCreationWizardStep('actions')
  }

  const applyMinimumStructurePreset = () => {
    setListFormDraft((current) => ensureMinimumListFormDraft(current, baseFormDraft))
    setDetailFormDraft((current) => ensureMinimumDetailFormDraft(current, baseFormDraft))
    setFormFormDraft((current) => ensureMinimumFormFormDraft(current, baseFormDraft))
    setSaveInfo('Struttura minima applicata')
    setEditorError(null)
    setBootstrapPreviewError(null)
  }

  const applyRecommendedActionsPreset = () => {
    setListFormDraft((current) => {
      const preparedDraft = ensureMinimumListFormDraft(current, baseFormDraft)
      const nextViews =
        preparedDraft.views.length > 0
          ? preparedDraft.views
          : [createEmptyListViewDraft()]

      const defaultViewIndex = nextViews.findIndex((view) => view.default)
      const targetIndex = defaultViewIndex >= 0 ? defaultViewIndex : 0

      return {
        ...preparedDraft,
        views: nextViews.map((view, index) =>
          index === targetIndex
            ? {
                ...view,
                default: index === targetIndex,
                rowActionsJson: serializeEntityActionDrafts([
                  { type: 'edit', label: 'Edit', target: '', entityId: '' },
                  { type: 'delete', label: 'Delete', target: '', entityId: '' },
                ]),
              }
            : view,
        ),
      }
    })

    setDetailFormDraft((current) => ({
      ...ensureMinimumDetailFormDraft(current, baseFormDraft),
      actionsJson: serializeEntityActionDrafts([
        { type: 'edit', label: 'Edit', target: '', entityId: '' },
        { type: 'delete', label: 'Delete', target: '', entityId: '' },
      ]),
    }))

    setFormFormDraft((current) => ensureMinimumFormFormDraft(current, baseFormDraft))

    setSaveInfo('Actions standard applicate')
    setEditorError(null)
  }

  const toggleRecommendedAction = (
    scope: 'list' | 'detail',
    type: 'edit' | 'delete',
    checked: boolean,
  ) => {
    const applyToggle = (entries: EntityActionDraft[]) => {
      const filteredEntries = entries.filter((entry) => entry.type !== type)
      if (!checked) {
        return filteredEntries
      }

      return [...filteredEntries, { type, label: type === 'edit' ? 'Edit' : 'Delete' }]
    }

    if (scope === 'list') {
      setListFormDraft((current) => {
        const preparedDraft = ensureMinimumListFormDraft(current, baseFormDraft)
        const nextViews =
          preparedDraft.views.length > 0
            ? preparedDraft.views
            : [createEmptyListViewDraft()]
        const defaultViewIndex = nextViews.findIndex((view) => view.default)
        const targetIndex = defaultViewIndex >= 0 ? defaultViewIndex : 0

        return {
          ...preparedDraft,
          views: nextViews.map((view, index) => {
            if (index !== targetIndex) {
              return view
            }

            return {
              ...view,
              default: index === targetIndex,
              rowActionsJson: serializeEntityActionDrafts(
                applyToggle(readEntityActionDrafts(view.rowActionsJson)),
              ),
            }
          }),
        }
      })
    } else {
      setDetailFormDraft((current) => ({
        ...ensureMinimumDetailFormDraft(current, baseFormDraft),
        actionsJson: serializeEntityActionDrafts(
          applyToggle(readEntityActionDrafts(current.actionsJson)),
        ),
      }))
      setFormFormDraft((current) => ensureMinimumFormFormDraft(current, baseFormDraft))
    }

    setSaveInfo(null)
    setEditorError(null)
  }

  const publishEntityCreationWizard = async () => {
    let nextConfig: EntityConfig

    try {
      nextConfig = buildEntityConfigFromDrafts(createEmptyEntityConfig(), {
        base: baseFormDraft,
        list: listFormDraft,
        detail: detailFormDraft,
        form: formFormDraft,
      })
      setEditorError(null)
    } catch (error) {
      const validationError = normalizeDraftValidationError(error)
      setEditorError(validationError.message)
      setCreationWizardStep(validationError.section === 'base' ? 'identity' : 'bootstrap')
      return
    }

    if (
      creationAclDraft.accessMode === 'permission-bound' &&
      creationAclDraft.permissionCodes.length === 0
    ) {
      setEditorError('Sezione Accesso: seleziona almeno una ACL permission o usa accesso autenticato.')
      setCreationWizardStep('access')
      return
    }

    setSaving(true)
    setSaveInfo(null)
    setPageError(null)
    setEditorError(null)

    try {
      const payload = await createEntityAdminConfig(nextConfig)
      const resourceId = `entity:${payload.entity.id}`
      const resourcePayload = await fetchAclResource(resourceId)
      await updateAclResource(resourceId, {
        ...resourcePayload.resource,
        accessMode: creationAclDraft.accessMode,
        permissions: [...creationAclDraft.permissionCodes],
      })

      setSelectedEntityConfig(payload.entity)
      setAclResourceStatus({
        id: resourceId,
        accessMode: creationAclDraft.accessMode,
        managedBy: 'system',
        syncState: 'present',
      })
      await refreshEntityList()
      navigate(buildEntityEditPath(payload.entity.id, 'base'), {
        replace: true,
        state: {
          saveInfo: 'Entity creata con wizard guidato',
        } satisfies EntityAdminLocationState,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore pubblicazione entity guidata'
      setPageError(message)
      await alert({
        title: 'Errore pubblicazione entity',
        description: message,
        tone: 'danger',
        confirmLabel: 'Chiudi',
      })
    } finally {
      setSaving(false)
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
      setAclResourceStatus(payload.aclResourceStatus)
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
      await alert({
        title: 'Errore salvataggio entity',
        description: message,
        tone: 'danger',
        confirmLabel: 'Chiudi',
      })
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
      setAclResourceStatus(payload.aclResourceStatus)
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
      await alert({
        title: 'Errore creazione entity',
        description: message,
        tone: 'danger',
        confirmLabel: 'Chiudi',
      })
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
      await alert({
        title: 'Errore eliminazione entity',
        description: message,
        tone: 'danger',
        confirmLabel: 'Chiudi',
      })
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
        <section
          ref={pageErrorRef}
          tabIndex={-1}
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm outline-none"
        >
          <p className="text-sm text-rose-700">{pageError}</p>
        </section>
      ) : null}

      {editorError ? (
        <section
          ref={editorErrorRef}
          tabIndex={-1}
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm outline-none"
        >
          <p className="text-sm text-rose-700">{editorError}</p>
        </section>
      ) : null}

      {isCreateRoute && bootstrapPreviewError ? (
        <section
          ref={bootstrapErrorRef}
          tabIndex={-1}
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm outline-none"
        >
          <p className="text-sm text-rose-700">{bootstrapPreviewError}</p>
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
        <EntityCreationWizard
          step={creationWizardStep}
          saving={saving}
          baseDraft={baseFormDraft}
          bootstrapPreview={bootstrapPreview}
          hasCurrentBootstrapPreview={hasCurrentBootstrapPreview}
          loadingBootstrapPreview={loadingBootstrapPreview}
          bootstrapPreviewError={bootstrapPreviewError}
          listStructureError={listStructureError}
          detailStructureError={detailStructureError}
          formStructureError={formStructureError}
          objectApiNameSuggestions={objectApiNameSuggestions}
          loadingObjectApiNameSuggestions={loadingObjectApiNameSuggestions}
          objectApiNameSuggestionsError={objectApiNameSuggestionsError}
          shouldShowObjectApiNameSuggestions={shouldShowObjectApiNameSuggestions}
          listFormDraft={listFormDraft}
          detailFormDraft={detailFormDraft}
          formFormDraft={formFormDraft}
          creationAclDraft={creationAclDraft}
          aclPermissionOptions={aclPermissionOptions}
          loadingAclPermissionOptions={loadingAclPermissionOptions}
          aclPermissionOptionsError={aclPermissionOptionsError}
          canCreateBaseEntity={canCreateBaseEntity}
          hasGeneratedStructure={hasGeneratedStructure}
          actionsReady={actionsReady}
          accessReady={accessReady}
          onStepChange={setCreationWizardStep}
          onChangeBaseDraft={updateBaseDraftField}
          onSelectObjectApiNameSuggestion={selectObjectApiNameSuggestion}
          onGenerateBootstrapPreview={() => {
            void generateBootstrapPreview()
          }}
          onApplyBootstrapPreview={applyBootstrapPreviewToDrafts}
          onApplyMinimumStructure={applyMinimumStructurePreset}
          onApplyRecommendedActions={applyRecommendedActionsPreset}
          onToggleRecommendedAction={toggleRecommendedAction}
          onChangeCreationAclDraft={setCreationAclDraft}
          onPublish={() => {
            void publishEntityCreationWizard()
          }}
          onCreateBaseOnly={() => {
            void saveNewEntityConfig()
          }}
        />
      ) : null}

      {isViewRoute && selectedEntitySummary ? (
        <>
            <EntitySummaryCard
              summary={selectedEntitySummary}
              entity={selectedEntityConfig}
              aclResourceStatus={aclResourceStatus}
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
          {aclResourceStatus && !isAclResourceOperational(aclResourceStatus) ? (
            <AclResourceStatusNotice
              status={aclResourceStatus}
              className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm text-sm text-amber-800"
            />
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
                      {formatAclResourceStatusLabel(entity.aclResourceStatus)}
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
  aclResourceStatus,
}: {
  summary: EntityAdminConfigSummary
  entity: EntityConfig | null
  aclResourceStatus: AclResourceStatus | null
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

      {aclResourceStatus && !isAclResourceOperational(aclResourceStatus) ? (
        <AclResourceStatusNotice
          status={aclResourceStatus}
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800"
        />
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

function formatAclResourceStatusLabel(status: AclResourceStatus): string {
  return `${formatAclResourceAccessMode(status.accessMode)} / ${formatAclResourceSyncState(status.syncState)}`
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

type EntityActionDraft = {
  type: 'edit' | 'delete' | 'link'
  label?: string
  target?: string
  entityId?: string
}

type EntityCreationWizardProps = {
  step: EntityCreationWizardStep
  saving: boolean
  baseDraft: BaseFormDraft
  bootstrapPreview: EntityAdminBootstrapPreviewResponse | null
  hasCurrentBootstrapPreview: boolean
  loadingBootstrapPreview: boolean
  bootstrapPreviewError: string | null
  listStructureError: string | null
  detailStructureError: string | null
  formStructureError: string | null
  objectApiNameSuggestions: SalesforceObjectApiNameSuggestion[]
  loadingObjectApiNameSuggestions: boolean
  objectApiNameSuggestionsError: string | null
  shouldShowObjectApiNameSuggestions: boolean
  listFormDraft: ListFormDraft
  detailFormDraft: DetailFormDraft
  formFormDraft: FormFormDraft
  creationAclDraft: EntityCreationAclDraft
  aclPermissionOptions: AclAdminPermissionSummary[]
  loadingAclPermissionOptions: boolean
  aclPermissionOptionsError: string | null
  canCreateBaseEntity: boolean
  hasGeneratedStructure: boolean
  actionsReady: boolean
  accessReady: boolean
  onStepChange: (step: EntityCreationWizardStep) => void
  onChangeBaseDraft: (field: BaseFormDraftKey, value: string) => void
  onSelectObjectApiNameSuggestion: (value: string) => void
  onGenerateBootstrapPreview: () => void
  onApplyBootstrapPreview: () => void
  onApplyMinimumStructure: () => void
  onApplyRecommendedActions: () => void
  onToggleRecommendedAction: (
    scope: 'list' | 'detail',
    type: 'edit' | 'delete',
    checked: boolean,
  ) => void
  onChangeCreationAclDraft: Dispatch<SetStateAction<EntityCreationAclDraft>>
  onPublish: () => void
  onCreateBaseOnly: () => void
}

function EntityCreationWizard({
  step,
  saving,
  baseDraft,
  bootstrapPreview,
  hasCurrentBootstrapPreview,
  loadingBootstrapPreview,
  bootstrapPreviewError,
  listStructureError,
  detailStructureError,
  formStructureError,
  objectApiNameSuggestions,
  loadingObjectApiNameSuggestions,
  objectApiNameSuggestionsError,
  shouldShowObjectApiNameSuggestions,
  listFormDraft,
  detailFormDraft,
  formFormDraft,
  creationAclDraft,
  aclPermissionOptions,
  loadingAclPermissionOptions,
  aclPermissionOptionsError,
  canCreateBaseEntity,
  hasGeneratedStructure,
  actionsReady,
  accessReady,
  onStepChange,
  onChangeBaseDraft,
  onSelectObjectApiNameSuggestion,
  onGenerateBootstrapPreview,
  onApplyBootstrapPreview,
  onApplyMinimumStructure,
  onApplyRecommendedActions,
  onToggleRecommendedAction,
  onChangeCreationAclDraft,
  onPublish,
  onCreateBaseOnly,
}: EntityCreationWizardProps) {
  const listRowActions = readEntityActionDrafts(listFormDraft.views[0]?.rowActionsJson ?? '')
  const detailActions = readEntityActionDrafts(detailFormDraft.actionsJson)
  const listEditEnabled = listRowActions.some((entry) => entry.type === 'edit')
  const listDeleteEnabled = listRowActions.some((entry) => entry.type === 'delete')
  const detailEditEnabled = detailActions.some((entry) => entry.type === 'edit')
  const detailDeleteEnabled = detailActions.some((entry) => entry.type === 'delete')
  const defaultView = listFormDraft.views.find((view) => view.default) ?? listFormDraft.views[0]
  const reviewItems = [
    { label: 'Identita', ready: canCreateBaseEntity, detail: baseDraft.objectApiName || 'Object API name mancante' },
    {
      label: 'Struttura',
      ready: hasGeneratedStructure,
      detail: hasGeneratedStructure
        ? `${listFormDraft.views.length} views, ${detailFormDraft.sections.length} detail sections, ${formFormDraft.sections.length} form sections`
        : [listStructureError, detailStructureError, formStructureError]
            .filter((entry): entry is string => Boolean(entry))
            .join(' | '),
    },
    {
      label: 'Actions',
      ready: actionsReady,
      detail: actionsReady
        ? `List ${listRowActions.length} / Detail ${detailActions.length}`
        : 'Attiva almeno Edit o Delete',
    },
    {
      label: 'Accesso',
      ready: accessReady,
      detail:
        creationAclDraft.accessMode === 'permission-bound'
          ? `${creationAclDraft.permissionCodes.length} permission selezionate`
          : creationAclDraft.accessMode,
    },
  ]

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Wizard
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Creazione guidata entity
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Segui i passaggi in ordine. Ogni step prepara automaticamente la configurazione successiva.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {ENTITY_CREATION_WIZARD_STEPS.map((item, index) => {
              const active = item.id === step
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onStepChange(item.id)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-sky-300 bg-sky-50 text-sky-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                    Step {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{item.label}</p>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {step === 'identity' ? (
        <>
          <EntityConfigBaseForm
            value={baseDraft}
            error={null}
            onChange={onChangeBaseDraft}
            suggestions={objectApiNameSuggestions}
            suggestionsLoading={loadingObjectApiNameSuggestions}
            suggestionsError={objectApiNameSuggestionsError}
            showSuggestions={shouldShowObjectApiNameSuggestions}
            onSelectSuggestion={onSelectObjectApiNameSuggestion}
            eyebrow="Step 1"
            title="Identita entity"
          />

          <WizardStepFooter
            backLabel="Crea base subito"
            onBack={onCreateBaseOnly}
            nextLabel="Continua a Bootstrap"
            onNext={() => onStepChange('bootstrap')}
            nextDisabled={!canCreateBaseEntity}
          />
        </>
      ) : null}

      {step === 'bootstrap' ? (
        <>
          <EntityBootstrapPreviewPanel
            preview={bootstrapPreview}
            previewCurrent={hasCurrentBootstrapPreview}
            previewLoading={loadingBootstrapPreview}
            previewError={bootstrapPreviewError}
            saving={saving}
            onGeneratePreview={onGenerateBootstrapPreview}
            onCreateWithPreset={onApplyBootstrapPreview}
            onCreateBaseOnly={onCreateBaseOnly}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Il preset standard genera list, detail e form minimi a partire dal describe Salesforce.
                Se vuoi partire comunque, puoi applicare anche una struttura minima locale con i campi obbligatori.
              </p>
              <button
                type="button"
                onClick={onApplyMinimumStructure}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Applica struttura minima
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <StructureStatusCard
                label="List"
                error={listStructureError}
                successLabel="Query e view minime valide"
              />
              <StructureStatusCard
                label="Detail"
                error={detailStructureError}
                successLabel="Query e sezione minima valide"
              />
              <StructureStatusCard
                label="Form"
                error={formStructureError}
                successLabel="Query e form minimo validi"
              />
            </div>
          </section>

          <WizardStepFooter
            onBack={() => onStepChange('identity')}
            onNext={() => onStepChange('actions')}
            nextLabel="Continua a Actions"
            nextDisabled={!hasGeneratedStructure}
          />
        </>
      ) : null}

      {step === 'actions' ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Step 3
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  Actions standard
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Attiva i casi d&apos;uso piu frequenti senza toccare JSON o view avanzate.
                </p>
              </div>
              <button
                type="button"
                onClick={onApplyRecommendedActions}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Applica Edit + Delete
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <WizardToggleCard
                title="List"
                description={
                  defaultView
                    ? `Le action verranno applicate alla view ${defaultView.label || defaultView.id || 'default'}.`
                    : 'Applica prima il preset standard per creare la view default.'
                }
                items={[
                  {
                    label: 'Edit in list',
                    checked: listEditEnabled,
                    onChange: (checked) => onToggleRecommendedAction('list', 'edit', checked),
                  },
                  {
                    label: 'Delete in list',
                    checked: listDeleteEnabled,
                    onChange: (checked) => onToggleRecommendedAction('list', 'delete', checked),
                  },
                ]}
              />

              <WizardToggleCard
                title="Detail"
                description="Le action vengono esposte nell’header del record."
                items={[
                  {
                    label: 'Edit in detail',
                    checked: detailEditEnabled,
                    onChange: (checked) => onToggleRecommendedAction('detail', 'edit', checked),
                  },
                  {
                    label: 'Delete in detail',
                    checked: detailDeleteEnabled,
                    onChange: (checked) => onToggleRecommendedAction('detail', 'delete', checked),
                  },
                ]}
              />
            </div>
          </section>

          <WizardStepFooter
            onBack={() => onStepChange('bootstrap')}
            onNext={() => onStepChange('access')}
            nextLabel="Continua a Accesso"
            nextDisabled={!hasGeneratedStructure}
          />
        </>
      ) : null}

      {step === 'access' ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="border-b border-slate-200 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Step 4
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Accesso</h3>
              <p className="mt-1 text-sm text-slate-600">
                Il wizard crea la resource ACL della entity e applica questo preset al publish finale.
              </p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <label className="text-sm font-medium text-slate-700">
                Access mode
                <select
                  value={creationAclDraft.accessMode}
                  onChange={(event) =>
                    onChangeCreationAclDraft((current) => ({
                      ...current,
                      accessMode: event.target.value as EntityCreationAclDraft['accessMode'],
                    }))
                  }
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="permission-bound">Permission-bound</option>
                  <option value="authenticated">Authenticated</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">ACL permissions</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Preset consigliato: tutte le permission che iniziano per `PORTAL_`.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeCreationAclDraft((current) => ({
                        ...current,
                        permissionCodes: selectSuggestedPortalPermissionCodes(aclPermissionOptions),
                      }))
                    }
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Applica preset portale
                  </button>
                </div>

                {aclPermissionOptionsError ? (
                  <p className="mt-3 text-sm text-rose-700">{aclPermissionOptionsError}</p>
                ) : null}

                {loadingAclPermissionOptions ? (
                  <p className="mt-3 text-sm text-slate-600">Caricamento permission...</p>
                ) : (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {aclPermissionOptions.map((permission) => {
                      const checked = creationAclDraft.permissionCodes.includes(permission.code)
                      return (
                        <label
                          key={permission.code}
                          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              onChangeCreationAclDraft((current) => ({
                                ...current,
                                permissionCodes: event.target.checked
                                  ? [...current.permissionCodes, permission.code]
                                  : current.permissionCodes.filter((code) => code !== permission.code),
                              }))
                            }
                            className="mt-0.5 h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
                          />
                          <span>
                            <span className="block font-semibold text-slate-900">{permission.code}</span>
                            {permission.label ? (
                              <span className="mt-1 block text-xs text-slate-500">
                                {permission.label}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          </section>

          <WizardStepFooter
            onBack={() => onStepChange('actions')}
            onNext={() => onStepChange('review')}
            nextLabel="Continua a Review"
            nextDisabled={!accessReady}
          />
        </>
      ) : null}

      {step === 'review' ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="border-b border-slate-200 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Step 5
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Review e publish</h3>
              <p className="mt-1 text-sm text-slate-600">
                Verifica i prerequisiti. Il publish crea entity config e riallinea la ACL resource.
              </p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-3">
                {reviewItems.map((item) => (
                  <article
                    key={item.label}
                    className={`rounded-2xl border px-4 py-4 ${
                      item.ready
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-amber-200 bg-amber-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                          item.ready
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.ready ? 'Ready' : 'Da completare'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
                  </article>
                ))}
              </div>

              <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Publish summary</p>
                <dl className="mt-4 space-y-3 text-sm text-slate-700">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Entity</dt>
                    <dd className="mt-1">{baseDraft.label || baseDraft.objectApiName || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Object API Name</dt>
                    <dd className="mt-1">{baseDraft.objectApiName || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Accesso</dt>
                    <dd className="mt-1">
                      {creationAclDraft.accessMode} / {creationAclDraft.permissionCodes.length} permissions
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>

          <WizardStepFooter
            onBack={() => onStepChange('access')}
            onNext={onPublish}
            nextLabel={saving ? 'Pubblicazione...' : 'Pubblica entity'}
            nextDisabled={!reviewItems.every((item) => item.ready) || saving}
          />
        </>
      ) : null}
    </div>
  )
}

function WizardToggleCard({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: Array<{
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
  }>
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <label
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
          >
            <span>{item.label}</span>
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(event) => item.onChange(event.target.checked)}
              className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
            />
          </label>
        ))}
      </div>
    </section>
  )
}

function WizardStepFooter({
  backLabel = 'Indietro',
  nextLabel = 'Continua',
  nextDisabled = false,
  onBack,
  onNext,
}: {
  backLabel?: string
  nextLabel?: string
  nextDisabled?: boolean
  onBack: () => void
  onNext: () => void
}) {
  return (
    <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onBack}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        {backLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
      >
        {nextLabel}
      </button>
    </section>
  )
}

function StructureStatusCard({
  label,
  error,
  successLabel,
}: {
  label: string
  error: string | null
  successLabel: string
}) {
  const ready = error === null

  return (
    <article
      className={`rounded-2xl border px-4 py-4 ${
        ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
            ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {ready ? 'Ready' : 'Fix needed'}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{ready ? successLabel : error}</p>
    </article>
  )
}

const ENTITY_CREATION_WIZARD_STEPS: Array<{
  id: EntityCreationWizardStep
  label: string
}> = [
  { id: 'identity', label: 'Identita' },
  { id: 'bootstrap', label: 'Bootstrap' },
  { id: 'actions', label: 'Actions' },
  { id: 'access', label: 'Accesso' },
  { id: 'review', label: 'Review' },
]

function ensureMinimumListFormDraft(
  draft: ListFormDraft,
  baseDraft: BaseFormDraft,
): ListFormDraft {
  const nextViews = draft.views.length > 0 ? draft.views : [createEmptyListViewDraft()]
  const targetIndex = Math.max(
    nextViews.findIndex((view) => view.default),
    0,
  )

  return {
    ...draft,
    title: draft.title.trim() || `${baseDraft.label.trim() || 'Entity'} List`,
    views: nextViews.map((view, index) =>
      index === targetIndex
        ? {
            ...view,
            id: view.id.trim() || 'all',
            label: view.label.trim() || 'All records',
            default: true,
            queryFields: view.queryFields.length > 0 ? view.queryFields : ['Id'],
            columns: view.columns.trim() || 'Id',
          }
        : view,
    ),
  }
}

function ensureMinimumDetailFormDraft(
  draft: DetailFormDraft,
  baseDraft: BaseFormDraft,
): DetailFormDraft {
  const nextSections = draft.sections.length > 0 ? draft.sections : createEmptyDetailFormDraft().sections
  const firstSection = nextSections[0]
  const nextFields =
    firstSection && firstSection.fields.length > 0
      ? firstSection.fields
      : createEmptyDetailFormDraft().sections[0].fields

  return {
    ...draft,
    fallbackTitle: draft.fallbackTitle.trim() || baseDraft.label.trim() || 'Detail',
    queryFields: draft.queryFields.length > 0 ? draft.queryFields : ['Id'],
    sections: nextSections.map((section, index) =>
      index === 0
        ? {
            ...section,
            title: section.title.trim() || 'Main',
            fields: nextFields.map((field, fieldIndex) =>
              fieldIndex === 0
                ? {
                    ...field,
                    sourceMode: 'field',
                    field: field.field.trim() || 'Id',
                    template: '',
                  }
                : field,
            ),
          }
        : section,
    ),
  }
}

function ensureMinimumFormFormDraft(
  draft: FormFormDraft,
  baseDraft: BaseFormDraft,
): FormFormDraft {
  const nextSections = draft.sections.length > 0 ? draft.sections : createEmptyFormDraft().sections
  const firstSection = nextSections[0]
  const nextFields =
    firstSection && firstSection.fields.length > 0
      ? firstSection.fields
      : createEmptyFormDraft().sections[0].fields

  return {
    ...draft,
    createTitle: draft.createTitle.trim() || `Nuovo ${baseDraft.label.trim() || 'record'}`,
    editTitle: draft.editTitle.trim() || `Modifica ${baseDraft.label.trim() || 'record'}`,
    queryFields: draft.queryFields.length > 0 ? draft.queryFields : ['Id'],
    sections: nextSections.map((section, index) =>
      index === 0
        ? {
            ...section,
            title: section.title.trim() || 'Main',
            fields: nextFields.map((field, fieldIndex) =>
              fieldIndex === 0
                ? {
                    ...field,
                    field: field.field.trim() || 'Id',
                  }
                : field,
            ),
          }
        : section,
    ),
  }
}

function getDraftSectionValidationMessage(
  section: 'list' | 'detail' | 'form',
  draft: ListFormDraft | DetailFormDraft | FormFormDraft,
  baseObjectApiName: string,
): string | null {
  if (baseObjectApiName.trim().length === 0) {
    return 'Compila objectApiName nello step Identita'
  }

  try {
    if (section === 'list') {
      parseListFormDraft(draft as ListFormDraft, baseObjectApiName)
    } else if (section === 'detail') {
      parseDetailFormDraft(draft as DetailFormDraft, baseObjectApiName)
    } else {
      parseFormDraft(draft as FormFormDraft, baseObjectApiName)
    }

    return null
  } catch (error) {
    return error instanceof Error ? error.message : `Sezione ${section} non valida`
  }
}

function selectSuggestedPortalPermissionCodes(
  permissions: AclAdminPermissionSummary[],
): string[] {
  return permissions
    .map((permission) => permission.code)
    .filter((code) => code.startsWith('PORTAL_'))
}

function readEntityActionDrafts(value: string): EntityActionDraft[] {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry): EntityActionDraft | null => {
        const type = entry.type
        if (type !== 'edit' && type !== 'delete' && type !== 'link') {
          return null
        }

        return {
          type,
          label: typeof entry.label === 'string' ? entry.label : undefined,
          target: typeof entry.target === 'string' ? entry.target : undefined,
          entityId: typeof entry.entityId === 'string' ? entry.entityId : undefined,
        }
      })
      .filter((entry): entry is EntityActionDraft => entry !== null)
  } catch {
    return []
  }
}

function serializeEntityActionDrafts(entries: EntityActionDraft[]): string {
  const normalizedEntries = entries.map((entry) => ({
    type: entry.type,
    ...(entry.label?.trim() ? { label: entry.label.trim() } : {}),
    ...(entry.target?.trim() ? { target: entry.target.trim() } : {}),
    ...(entry.entityId?.trim() ? { entityId: entry.entityId.trim() } : {}),
  }))

  return normalizedEntries.length > 0 ? JSON.stringify(normalizedEntries, null, 2) : ''
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
  const objectApiName = baseDraft.objectApiName.trim()
  const id = baseDraft.id.trim() || objectApiName
  const label = baseDraft.label.trim() || buildEntityLabelFromObjectApiName(objectApiName)

  if (objectApiName.length === 0 || id.length === 0 || label.length === 0) {
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

function buildEntityLabelFromObjectApiName(objectApiName: string): string {
  const normalized = objectApiName
    .replace(/__(c|r)$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()

  return normalized.length > 0 ? normalized : objectApiName
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
  const resolvedId = baseDraft.id.trim() || baseDraft.objectApiName.trim()

  if (resolvedId === NEW_ENTITY_SENTINEL) {
    return `Entity Id non puo essere ${NEW_ENTITY_SENTINEL}`
  }

  return `Compila objectApiName per ${action} la entity`
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
