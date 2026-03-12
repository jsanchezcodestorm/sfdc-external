import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAppDialog } from '../../components/app-dialog'
import type {
  ReportContactSuggestion,
  ReportPermissionSuggestion,
  ReportScalarValue,
  ReportShareGrant,
} from '../reports/report-types'
import { useAuth } from '../auth/useAuth'

import {
  createDashboard,
  createDashboardFolder,
  deleteDashboard,
  deleteDashboardFolder,
  fetchDashboard,
  fetchDashboardFolder,
  fetchDashboardsWorkspace,
  runDashboard,
  searchDashboardContacts,
  searchDashboardFields,
  searchDashboardPermissions,
  searchDashboardSourceReports,
  updateDashboard,
  updateDashboardFolder,
} from './dashboard-api'
import type {
  DashboardAppliedFilter,
  DashboardChartWidgetDefinition,
  DashboardDefinition,
  DashboardFieldSuggestion,
  DashboardFilterDefinition,
  DashboardFolderResponse,
  DashboardFolderSummary,
  DashboardMetricDefinition,
  DashboardResponse,
  DashboardRunChartPoint,
  DashboardRunChartWidget,
  DashboardRunResponse,
  DashboardRunTableGroupedWidget,
  DashboardRunTableRowsWidget,
  DashboardRunWidget,
  DashboardsWorkspaceResponse,
  DashboardSourceReportSuggestion,
  DashboardTableGroupedWidgetDefinition,
  DashboardWidgetDefinition,
  DashboardWidgetLayout,
  UpsertDashboardFolderPayload,
  UpsertDashboardPayload,
} from './dashboard-types'

type DashboardRuntimeWorkspaceProps = {
  appId: string
  itemId: string
  appLabel: string
  itemLabel: string
  itemDescription?: string
}

type DashboardRouteSelection =
  | { kind: 'workspace' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'dashboard'; dashboardId: string }
  | { kind: 'invalid' }

type FolderDraft = {
  label: string
  description: string
  accessMode: 'personal' | 'shared'
  shares: ReportShareGrant[]
}

type DashboardDraft = {
  folderId: string
  sourceReportId: string
  label: string
  description: string
  filters: DashboardFilterDefinition[]
  widgets: DashboardWidgetDefinition[]
  shareMode: 'inherit' | 'restricted' | 'personal'
  shares: ReportShareGrant[]
}

type FolderEditorState =
  | {
      mode: 'create'
      draft: FolderDraft
    }
  | {
      mode: 'edit'
      folderId: string
      draft: FolderDraft
    }

type WidgetEditorKind = 'kpi' | 'chart' | 'table-grouped' | 'table-rows'

const EMPTY_SHARE: ReportShareGrant = { subjectType: 'permission', subjectId: '' }
const MAX_DASHBOARD_FILTERS = 3
const NUMERIC_FIELD_TYPES = new Set(['int', 'double', 'currency', 'percent', 'number', 'long'])
const CHART_COLORS = ['#0f766e', '#2563eb', '#ea580c', '#be123c', '#7c3aed', '#047857', '#9333ea', '#ca8a04']

export function DashboardRuntimeWorkspace({
  appId,
  itemId,
  appLabel,
  itemLabel,
  itemDescription,
}: DashboardRuntimeWorkspaceProps) {
  const params = useParams()
  const navigate = useNavigate()
  const { confirm } = useAppDialog()
  const { user } = useAuth()
  const nestedPath = typeof params['*'] === 'string' ? params['*'] : ''
  const routeSelection = useMemo(() => parseDashboardRoute(nestedPath), [nestedPath])

  const [workspace, setWorkspace] = useState<DashboardsWorkspaceResponse | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)

  const [folderData, setFolderData] = useState<DashboardFolderResponse | null>(null)
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [runData, setRunData] = useState<DashboardRunResponse | null>(null)
  const [runLoading, setRunLoading] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runtimeFilterValues, setRuntimeFilterValues] = useState<Record<string, string>>({})

  const [folderEditorState, setFolderEditorState] = useState<FolderEditorState | null>(null)
  const [createDashboardOpen, setCreateDashboardOpen] = useState(false)
  const [dashboardDraft, setDashboardDraft] = useState<DashboardDraft | null>(null)
  const [editorMode, setEditorMode] = useState<'run' | 'edit'>('run')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const dashboardItemBasePath = useMemo(() => buildDashboardItemBasePath(appId, itemId), [appId, itemId])
  const currentCanWrite = workspace?.canWrite ?? folderData?.canWrite ?? dashboardData?.canWrite ?? false
  const canWriteUi = Boolean(user) && currentCanWrite
  const routeDashboardId = routeSelection.kind === 'dashboard' ? routeSelection.dashboardId : null
  const routeResetKey =
    routeSelection.kind === 'dashboard' ? routeSelection.dashboardId : routeSelection.kind
  const activeFolderId =
    routeSelection.kind === 'folder'
      ? routeSelection.folderId
      : routeSelection.kind === 'dashboard'
        ? dashboardData?.dashboard.folderId ?? null
        : null

  const refreshWorkspace = useCallback(async () => {
    setWorkspaceLoading(true)
    try {
      const payload = await fetchDashboardsWorkspace(appId)
      setWorkspace(payload)
      setWorkspaceError(null)
    } catch (error) {
      setWorkspace(null)
      setWorkspaceError(error instanceof Error ? error.message : 'Errore caricamento workspace dashboard')
    } finally {
      setWorkspaceLoading(false)
    }
  }, [appId])

  useEffect(() => {
    void refreshWorkspace()
  }, [refreshWorkspace])

  useEffect(() => {
    setDetailError(null)
    setFolderData(null)
    setDashboardData(null)
    setRunData(null)
    setRuntimeFilterValues({})

    if (routeSelection.kind === 'workspace') {
      return
    }

    if (routeSelection.kind === 'invalid') {
      setDetailError('Route dashboard non valida')
      return
    }

    let cancelled = false
    setDetailLoading(true)

    const loadPromise =
      routeSelection.kind === 'folder'
        ? fetchDashboardFolder(appId, routeSelection.folderId)
        : fetchDashboard(appId, routeSelection.dashboardId)

    void loadPromise
      .then((payload) => {
        if (cancelled) {
          return
        }

        if (routeSelection.kind === 'folder') {
          setFolderData(payload as DashboardFolderResponse)
          setDashboardData(null)
          return
        }

        const typedPayload = payload as DashboardResponse
        setDashboardData(typedPayload)
        setFolderData(null)
        setDashboardDraft(createDashboardDraftFromDefinition(typedPayload.dashboard))
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : 'Errore caricamento dashboard')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [appId, routeSelection])

  useEffect(() => {
    setEditorMode('run')
  }, [routeResetKey])

  const loadDashboardRun = useCallback(
    async (filters: DashboardAppliedFilter[] = []) => {
      if (!routeDashboardId) {
        return
      }

      setRunLoading(true)
      try {
        const payload = await runDashboard(appId, routeDashboardId, { filters })
        setRunData(payload)
        setRunError(null)
        setRuntimeFilterValues(mapAppliedFiltersToInput(payload.appliedFilters))
      } catch (error) {
        setRunError(error instanceof Error ? error.message : 'Errore esecuzione dashboard')
      } finally {
        setRunLoading(false)
      }
    },
    [appId, routeDashboardId],
  )

  useEffect(() => {
    if (!routeDashboardId || editorMode !== 'run' || !dashboardData?.dashboard.id) {
      return
    }

    void loadDashboardRun()
  }, [dashboardData?.dashboard.id, editorMode, loadDashboardRun, routeDashboardId])

  const openCreateFolder = () => {
    setFolderEditorState({
      mode: 'create',
      draft: createEmptyFolderDraft(),
    })
    setActionError(null)
  }

  const openEditFolder = (folder: DashboardFolderSummary) => {
    setFolderEditorState({
      mode: 'edit',
      folderId: folder.id,
      draft: createFolderDraftFromSummary(folder),
    })
    setActionError(null)
  }

  const saveFolder = async (draft: FolderDraft) => {
    setActionBusy(true)
    setActionError(null)

    try {
      const payload = folderDraftToPayload(draft)
      const response =
        folderEditorState?.mode === 'edit'
          ? await updateDashboardFolder(appId, folderEditorState.folderId, payload)
          : await createDashboardFolder(appId, payload)

      await refreshWorkspace()
      setFolderEditorState(null)
      navigate(buildDashboardFolderPath(dashboardItemBasePath, response.folder.id))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore salvataggio cartella')
    } finally {
      setActionBusy(false)
    }
  }

  const removeCurrentFolder = async () => {
    if (!folderData?.folder.id) {
      return
    }

    const approved = await confirm({
      title: 'Elimina cartella dashboard',
      description: `Eliminare la cartella ${folderData.folder.label}?`,
      confirmLabel: 'Elimina',
      cancelLabel: 'Annulla',
      tone: 'danger',
    })

    if (!approved) {
      return
    }

    setActionBusy(true)
    setActionError(null)

    try {
      await deleteDashboardFolder(appId, folderData.folder.id)
      await refreshWorkspace()
      navigate(dashboardItemBasePath)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore eliminazione cartella')
    } finally {
      setActionBusy(false)
    }
  }

  const openCreateDashboard = (folderId?: string) => {
    setDashboardDraft(createEmptyDashboardDraft(folderId ?? activeFolderId ?? workspace?.folders[0]?.id ?? ''))
    setCreateDashboardOpen(true)
    setActionError(null)
  }

  const saveNewDashboard = async (draft: DashboardDraft) => {
    setActionBusy(true)
    setActionError(null)

    try {
      const payload = dashboardDraftToPayload(draft)
      const response = await createDashboard(appId, payload)
      await refreshWorkspace()
      setCreateDashboardOpen(false)
      setDashboardDraft(createDashboardDraftFromDefinition(response.dashboard))
      navigate(buildDashboardPath(dashboardItemBasePath, response.dashboard.id))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore creazione dashboard')
    } finally {
      setActionBusy(false)
    }
  }

  const saveExistingDashboard = async () => {
    if (!dashboardData?.dashboard.id || !dashboardDraft) {
      return
    }

    setActionBusy(true)
    setActionError(null)

    try {
      const payload = dashboardDraftToPayload(dashboardDraft)
      const response = await updateDashboard(appId, dashboardData.dashboard.id, payload)
      await refreshWorkspace()
      setDashboardData(response)
      setDashboardDraft(createDashboardDraftFromDefinition(response.dashboard))
      navigate(buildDashboardPath(dashboardItemBasePath, response.dashboard.id))
      setEditorMode('run')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore aggiornamento dashboard')
    } finally {
      setActionBusy(false)
    }
  }

  const removeCurrentDashboard = async () => {
    if (!dashboardData?.dashboard.id) {
      return
    }

    const approved = await confirm({
      title: 'Elimina dashboard',
      description: `Eliminare la dashboard ${dashboardData.dashboard.label}?`,
      confirmLabel: 'Elimina',
      cancelLabel: 'Annulla',
      tone: 'danger',
    })

    if (!approved) {
      return
    }

    setActionBusy(true)
    setActionError(null)

    try {
      const folderId = dashboardData.dashboard.folderId
      await deleteDashboard(appId, dashboardData.dashboard.id)
      await refreshWorkspace()
      navigate(buildDashboardFolderPath(dashboardItemBasePath, folderId))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore eliminazione dashboard')
    } finally {
      setActionBusy(false)
    }
  }

  const currentFolderSummary = useMemo(() => {
    if (!activeFolderId) {
      return null
    }

    return workspace?.folders.find((folder) => folder.id === activeFolderId) ?? null
  }, [activeFolderId, workspace?.folders])

  const updateRuntimeFilter = (field: string, encodedValue: string) => {
    const nextFilterValues = {
      ...runtimeFilterValues,
      [field]: encodedValue,
    }
    setRuntimeFilterValues(nextFilterValues)
    void loadDashboardRun(decodeAppliedFilters(nextFilterValues))
  }

  const renderContent = () => {
    if (workspaceLoading && routeSelection.kind === 'workspace') {
      return <WorkspaceState title="Caricamento dashboard..." description="Sto caricando cartelle, dashboard e sorgenti disponibili." />
    }

    if (workspaceError && !workspace) {
      return <WorkspaceState title="Modulo dashboard non disponibile" description={workspaceError} tone="error" />
    }

    if (detailLoading) {
      return <WorkspaceState title="Caricamento dettaglio..." description="Sto recuperando il contenuto richiesto." />
    }

    if (detailError) {
      return <WorkspaceState title="Dettaglio non disponibile" description={detailError} tone="error" />
    }

    if (routeSelection.kind === 'workspace') {
      return (
        <WorkspaceOverview
          workspace={workspace}
          canWrite={canWriteUi}
          basePath={dashboardItemBasePath}
          onCreateFolder={openCreateFolder}
          onCreateDashboard={() => openCreateDashboard()}
        />
      )
    }

    if (routeSelection.kind === 'folder' && folderData) {
      return (
        <FolderView
          folderData={folderData}
          basePath={dashboardItemBasePath}
          canWrite={canWriteUi}
          actionBusy={actionBusy}
          onCreateDashboard={() => openCreateDashboard(folderData.folder.id)}
          onEditFolder={() => openEditFolder(folderData.folder)}
          onDeleteFolder={() => {
            void removeCurrentFolder()
          }}
        />
      )
    }

    if (routeSelection.kind === 'dashboard' && dashboardData && dashboardDraft) {
      return (
        <DashboardView
          basePath={dashboardItemBasePath}
          canWrite={canWriteUi}
          editorMode={editorMode}
          actionBusy={actionBusy}
          dashboardResponse={dashboardData}
          folderOptions={workspace?.folders ?? []}
          runResponse={runData}
          runLoading={runLoading}
          runError={runError}
          runtimeFilterValues={runtimeFilterValues}
          draft={dashboardDraft}
          onModeChange={setEditorMode}
          onDraftChange={setDashboardDraft}
          onRuntimeFilterChange={updateRuntimeFilter}
          onRefreshRun={() => {
            void loadDashboardRun(decodeAppliedFilters(runtimeFilterValues))
          }}
          onSave={() => {
            void saveExistingDashboard()
          }}
          onDelete={() => {
            void removeCurrentDashboard()
          }}
        />
      )
    }

    return <WorkspaceState title="Contenuto non disponibile" description="La route dashboard richiesta non produce un contenuto navigabile." tone="error" />
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{appLabel}</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{itemLabel}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {itemDescription?.trim() || 'Modulo dashboard interno app-scoped con folder dedicate, source report singolo, filtri globali e widget KPI, chart e table.'}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={dashboardItemBasePath}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Workspace
            </Link>
            {canWriteUi ? (
              <button
                type="button"
                onClick={openCreateFolder}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-slate-700"
              >
                + Cartella
              </button>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Cartelle</p>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {workspace?.folders.length ?? 0}
            </span>
          </div>

          {workspaceLoading ? (
            <p className="mt-4 text-sm text-slate-500">Caricamento cartelle...</p>
          ) : workspace?.folders.length ? (
            <nav className="mt-4 space-y-2" aria-label="Dashboard folders">
              {workspace.folders.map((folder) => (
                <Link
                  key={folder.id}
                  to={buildDashboardFolderPath(dashboardItemBasePath, folder.id)}
                  className={`block rounded-2xl border px-4 py-3 transition ${
                    folder.id === activeFolderId
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="block min-w-0">
                      <span className="block truncate text-sm font-semibold">{folder.label}</span>
                      <span className={`mt-1 block text-xs ${folder.id === activeFolderId ? 'text-slate-300' : 'text-slate-500'}`}>
                        {folder.accessMode === 'shared' ? 'Condivisa' : 'Personale'}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      folder.id === activeFolderId ? 'bg-white/10 text-white' : 'bg-white text-slate-600'
                    }`}>
                      {folder.dashboardCount}
                    </span>
                  </div>
                </Link>
              ))}
            </nav>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Nessuna cartella dashboard disponibile in questa app.
            </p>
          )}

          {currentFolderSummary && canWriteUi ? (
            <button
              type="button"
              onClick={() => openCreateDashboard(currentFolderSummary.id)}
              className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Nuova dashboard in {currentFolderSummary.label}
            </button>
          ) : null}
        </section>
      </aside>

      <div className="space-y-5">
        {actionError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </div>
        ) : null}

        {renderContent()}
      </div>

      {folderEditorState ? (
        <FolderEditorModal
          appId={appId}
          mode={folderEditorState.mode}
          busy={actionBusy}
          value={folderEditorState.draft}
          onClose={() => setFolderEditorState(null)}
          onSave={(nextDraft) => {
            void saveFolder(nextDraft)
          }}
        />
      ) : null}

      {createDashboardOpen && dashboardDraft ? (
        <DashboardEditorModal
          appId={appId}
          folderOptions={workspace?.folders ?? []}
          busy={actionBusy}
          mode="create"
          value={dashboardDraft}
          onClose={() => setCreateDashboardOpen(false)}
          onSave={(nextDraft) => {
            void saveNewDashboard(nextDraft)
          }}
        />
      ) : null}
    </div>
  )
}

function WorkspaceOverview({
  workspace,
  canWrite,
  basePath,
  onCreateFolder,
  onCreateDashboard,
}: {
  workspace: DashboardsWorkspaceResponse | null
  canWrite: boolean
  basePath: string
  onCreateFolder: () => void
  onCreateDashboard: () => void
}) {
  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Run + Edit</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Dashboard workspace
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Costruisci dashboard multi-widget su un source report, gestisci sharing app-scoped e applica filtri globali stile Salesforce a KPI, chart e tabelle.
            </p>
          </div>

          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCreateFolder}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Nuova cartella
              </button>
              <button
                type="button"
                onClick={onCreateDashboard}
                disabled={!workspace?.folders.length}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Nuova dashboard
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {workspace?.folders.length ? (
          workspace.folders.map((folder) => (
            <Link
              key={folder.id}
              to={buildDashboardFolderPath(basePath, folder.id)}
              className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-slate-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                  {folder.accessMode === 'shared' ? 'Shared folder' : 'Personal folder'}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {formatDate(folder.updatedAt)}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-slate-950 group-hover:text-slate-700">{folder.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {folder.description?.trim() || 'Nessuna descrizione configurata.'}
              </p>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <span>{folder.dashboardCount} dashboard accessibili</span>
                <span>{folder.shares.length} share</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500 xl:col-span-2">
            Nessuna cartella disponibile. Crea la prima cartella dashboard per iniziare.
          </div>
        )}
      </section>
    </>
  )
}

function FolderView({
  folderData,
  basePath,
  canWrite,
  actionBusy,
  onCreateDashboard,
  onEditFolder,
  onDeleteFolder,
}: {
  folderData: DashboardFolderResponse
  basePath: string
  canWrite: boolean
  actionBusy: boolean
  onCreateDashboard: () => void
  onEditFolder: () => void
  onDeleteFolder: () => void
}) {
  const { folder, dashboards } = folderData

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Folder</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{folder.label}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              {folder.description?.trim() || 'Cartella dashboard senza descrizione.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {folder.accessMode === 'shared' ? 'Condivisa' : 'Personale'}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {dashboards.length} dashboard
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                owner {folder.ownerContactId}
              </span>
            </div>
          </div>

          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCreateDashboard}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Nuova dashboard
              </button>
              {folder.canEdit ? (
                <button
                  type="button"
                  onClick={onEditFolder}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Modifica cartella
                </button>
              ) : null}
              {folder.canEdit ? (
                <button
                  type="button"
                  onClick={onDeleteFolder}
                  disabled={actionBusy}
                  className="rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Elimina
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Dashboard disponibili</p>
            <p className="mt-1 text-sm text-slate-500">
              Run per gli utenti autorizzati; edit e sharing solo per owner o admin nel v1.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
            {dashboards.length}
          </span>
        </div>

        {dashboards.length ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {dashboards.map((dashboard) => (
              <Link
                key={dashboard.id}
                to={buildDashboardPath(basePath, dashboard.id)}
                className="group rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                    {dashboard.sourceObjectApiName}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {formatDate(dashboard.updatedAt)}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950 group-hover:text-slate-700">{dashboard.label}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {dashboard.description?.trim() || 'Nessuna descrizione configurata.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{dashboard.filterCount} filtri globali</span>
                  <span>{dashboard.widgetCount} widget</span>
                  <span>source {dashboard.sourceReportLabel}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
            Nessuna dashboard in questa cartella.
          </div>
        )}
      </section>
    </>
  )
}

function DashboardView({
  basePath,
  canWrite,
  editorMode,
  actionBusy,
  dashboardResponse,
  folderOptions,
  runResponse,
  runLoading,
  runError,
  runtimeFilterValues,
  draft,
  onModeChange,
  onDraftChange,
  onRuntimeFilterChange,
  onRefreshRun,
  onSave,
  onDelete,
}: {
  basePath: string
  canWrite: boolean
  editorMode: 'run' | 'edit'
  actionBusy: boolean
  dashboardResponse: DashboardResponse
  folderOptions: DashboardFolderSummary[]
  runResponse: DashboardRunResponse | null
  runLoading: boolean
  runError: string | null
  runtimeFilterValues: Record<string, string>
  draft: DashboardDraft
  onModeChange: (value: 'run' | 'edit') => void
  onDraftChange: (value: DashboardDraft) => void
  onRuntimeFilterChange: (field: string, value: string) => void
  onRefreshRun: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const dashboard = dashboardResponse.dashboard

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={buildDashboardFolderPath(basePath, dashboard.folderId)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 transition hover:border-slate-300 hover:bg-white"
              >
                Torna alla cartella
              </Link>
              <span className="rounded-full border border-slate-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                source {dashboard.sourceReportLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                {dashboard.sourceObjectApiName}
              </span>
            </div>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{dashboard.label}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              {dashboard.description?.trim() || 'Dashboard interna configurata sul modulo app-scoped.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {dashboard.filterCount} filtri globali
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {dashboard.widgetCount} widget
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                share {dashboard.shareMode}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onModeChange('run')}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                editorMode === 'run'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              Run
            </button>
            {canWrite && dashboard.canEdit ? (
              <button
                type="button"
                onClick={() => onModeChange('edit')}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  editorMode === 'edit'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                Edit
              </button>
            ) : null}
            {canWrite && dashboard.canEdit ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={actionBusy}
                className="rounded-2xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Elimina
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {editorMode === 'run' ? (
        <DashboardRunPanel
          dashboard={dashboard}
          runResponse={runResponse}
          runLoading={runLoading}
          runError={runError}
          runtimeFilterValues={runtimeFilterValues}
          onFilterChange={onRuntimeFilterChange}
          onRefreshRun={onRefreshRun}
        />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Builder</p>
              <p className="mt-1 text-sm text-slate-500">
                Configura source report, filtri globali, widget, layout e sharing. Il source report resta fisso dopo la creazione.
              </p>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={actionBusy}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionBusy ? 'Salvataggio...' : 'Salva dashboard'}
            </button>
          </div>

          <div className="mt-6">
            <DashboardEditorForm
              appId={dashboard.appId}
              folderOptions={folderOptions}
              mode="edit"
              value={draft}
              onChange={onDraftChange}
            />
          </div>
        </section>
      )}
    </>
  )
}

function DashboardRunPanel({
  dashboard,
  runResponse,
  runLoading,
  runError,
  runtimeFilterValues,
  onFilterChange,
  onRefreshRun,
}: {
  dashboard: DashboardDefinition
  runResponse: DashboardRunResponse | null
  runLoading: boolean
  runError: string | null
  runtimeFilterValues: Record<string, string>
  onFilterChange: (field: string, value: string) => void
  onRefreshRun: () => void
}) {
  const renderedDashboard = runResponse?.dashboard ?? dashboard
  const widgetDefinitions = useMemo(
    () => [...renderedDashboard.widgets].sort(compareWidgetLayout),
    [renderedDashboard.widgets],
  )
  const widgetsById = useMemo(
    () => new Map((runResponse?.widgets ?? []).map((widget) => [widget.id, widget])),
    [runResponse?.widgets],
  )

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Esecuzione dashboard</p>
            <p className="mt-1 text-sm text-slate-500">
              Tutti i widget vengono ricompilati server-side dal source report con visibility, sharing e filtri runtime.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshRun}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Riesegui
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{dashboard.sourceObjectApiName}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{dashboard.widgetCount} widget</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{dashboard.filterCount} filtri</span>
        </div>

        {runResponse?.availableFilters.length ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {runResponse.availableFilters.map((filter) => (
              <label key={filter.field} className="text-sm font-medium text-slate-700">
                {filter.label}
                <select
                  value={runtimeFilterValues[filter.field] ?? ''}
                  onChange={(event) => onFilterChange(filter.field, event.target.value)}
                  className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                >
                  <option value="">Tutti i valori</option>
                  {filter.options.map((option) => {
                    const encodedValue = encodeScalarValue(option.value)
                    return (
                      <option key={`${filter.field}-${encodedValue}`} value={encodedValue}>
                        {option.label} ({option.count})
                      </option>
                    )
                  })}
                </select>
              </label>
            ))}
          </div>
        ) : null}
      </section>

      {runError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {runError}
        </div>
      ) : null}

      {runLoading && !runResponse ? (
        <WorkspaceState title="Esecuzione in corso..." description="Sto preparando i widget della dashboard." />
      ) : runResponse ? (
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="overflow-x-auto">
            <div className="grid min-w-[48rem] grid-cols-12 gap-4 auto-rows-[72px]">
              {widgetDefinitions.map((definition) => (
                <DashboardRunWidgetCard
                  key={definition.id}
                  definition={definition}
                  widget={widgetsById.get(definition.id) ?? null}
                />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <WorkspaceState title="Run non ancora eseguito" description="Avvia l&apos;esecuzione per caricare i widget della dashboard." />
      )}
    </>
  )
}

function DashboardRunWidgetCard({
  definition,
  widget,
}: {
  definition: DashboardWidgetDefinition
  widget: DashboardRunWidget | null
}) {
  return (
    <article
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      style={buildWidgetGridStyle(definition.layout)}
    >
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{definition.title}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">
              {describeWidgetDefinition(definition)}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
            {definition.id}
          </span>
        </div>
      </header>

      <div className="h-[calc(100%-4.25rem)] overflow-auto px-5 py-4">
        {!widget ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Nessun dato disponibile per questo widget.
          </div>
        ) : widget.type === 'kpi' ? (
          <KpiWidgetView widget={widget} />
        ) : widget.type === 'chart' ? (
          <ChartWidgetView widget={widget} />
        ) : widget.displayMode === 'grouped' ? (
          <GroupedTableWidgetView widget={widget} />
        ) : (
          <RowsTableWidgetView widget={widget} />
        )}
      </div>
    </article>
  )
}

function KpiWidgetView({ widget }: { widget: Extract<DashboardRunWidget, { type: 'kpi' }> }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {formatMetricLabel(widget.metric)}
      </p>
      <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950">{formatNumericValue(widget.value)}</p>
    </div>
  )
}

function ChartWidgetView({ widget }: { widget: DashboardRunChartWidget }) {
  if (widget.points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Nessun dato disponibile per il grafico.
      </div>
    )
  }

  switch (widget.chartType) {
    case 'bar':
      return <BarChartWidgetView points={widget.points} />
    case 'line':
      return <LineChartWidgetView points={widget.points} />
    case 'pie':
      return <PieChartWidgetView points={widget.points} donut={false} />
    case 'donut':
      return <PieChartWidgetView points={widget.points} donut />
  }
}

function BarChartWidgetView({ points }: { points: DashboardRunChartPoint[] }) {
  const maxValue = Math.max(...points.map((point) => point.value), 1)

  return (
    <div className="space-y-3">
      {points.map((point, index) => (
        <div key={point.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{point.label}</span>
            <span className="font-semibold text-slate-950">{formatNumericValue(point.value)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full"
              style={{
                width: `${Math.max((point.value / maxValue) * 100, 2)}%`,
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function LineChartWidgetView({ points }: { points: DashboardRunChartPoint[] }) {
  const width = 420
  const height = 180
  const padding = 18
  const maxValue = Math.max(...points.map((point) => point.value), 1)
  const minValue = Math.min(...points.map((point) => point.value), 0)
  const range = Math.max(maxValue - minValue, 1)
  const polyline = points
    .map((point, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1)
      const y = height - padding - ((point.value - minValue) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-2xl border border-slate-200 bg-slate-50">
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <polyline fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={polyline} />
        {points.map((point, index) => {
          const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1)
          const y = height - padding - ((point.value - minValue) / range) * (height - padding * 2)
          return <circle key={point.key} cx={x} cy={y} r="4.5" fill="#0f172a" />
        })}
      </svg>
      <div className="grid gap-2 md:grid-cols-2">
        {points.map((point) => (
          <div key={point.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="truncate font-medium text-slate-700">{point.label}</p>
            <p className="mt-1 font-semibold text-slate-950">{formatNumericValue(point.value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PieChartWidgetView({
  points,
  donut,
}: {
  points: DashboardRunChartPoint[]
  donut: boolean
}) {
  const total = Math.max(points.reduce((sum, point) => sum + point.value, 0), 1)
  const gradientStops = points.reduce<Array<string>>((segments, point, index) => {
    const previousValue = points
      .slice(0, index)
      .reduce((sum, entry) => sum + entry.value, 0)
    const start = (previousValue / total) * 100
    const end = ((previousValue + point.value) / total) * 100
    const color = CHART_COLORS[index % CHART_COLORS.length]
    segments.push(`${color} ${start}% ${end}%`)
    return segments
  }, []).join(', ')

  return (
    <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="flex items-center justify-center">
        <div
          className={`relative h-44 w-44 rounded-full border border-slate-200 ${donut ? 'after:absolute after:inset-[22%] after:rounded-full after:bg-white after:content-[\'\']' : ''}`}
          style={{ backgroundImage: `conic-gradient(${gradientStops})` }}
        >
          <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-slate-900">
            {formatNumericValue(total)}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {points.map((point, index) => (
          <div key={point.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              <span className="truncate">{point.label}</span>
            </span>
            <span className="font-semibold text-slate-950">
              {formatNumericValue(point.value)} · {Math.round((point.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupedTableWidgetView({ widget }: { widget: DashboardRunTableGroupedWidget }) {
  return widget.rows.length ? (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-3 py-3 text-left">Dimensione</th>
            <th className="px-3 py-3 text-right">Valore</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {widget.rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-3 text-slate-700">{row.label}</td>
              <td className="px-3 py-3 text-right font-semibold text-slate-950">{formatNumericValue(row.metricValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      Nessuna aggregazione disponibile.
    </div>
  )
}

function RowsTableWidgetView({ widget }: { widget: DashboardRunTableRowsWidget }) {
  return widget.rows.length ? (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              {widget.columns.map((column) => (
                <th key={column.field} className="px-3 py-3 text-left">
                  {column.label || column.field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {widget.rows.map((row) => (
              <tr key={row.id}>
                {widget.columns.map((column) => (
                  <td key={`${row.id}-${column.field}`} className="px-3 py-3 text-slate-700">
                    {formatRunValue(row.values[column.field])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      Nessuna riga disponibile.
    </div>
  )
}

function FolderEditorModal({
  appId,
  mode,
  busy,
  value,
  onClose,
  onSave,
}: {
  appId: string
  mode: 'create' | 'edit'
  busy: boolean
  value: FolderDraft
  onClose: () => void
  onSave: (value: FolderDraft) => void
}) {
  const [draft, setDraft] = useState<FolderDraft>(value)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (!draft.label.trim()) {
      setError('Label cartella obbligatoria')
      return
    }

    if (draft.accessMode === 'shared' && draft.shares.filter(hasShareSubject).length === 0) {
      setError('Le cartelle condivise richiedono almeno uno share grant')
      return
    }

    setError(null)
    onSave({
      ...draft,
      label: draft.label.trim(),
      description: draft.description.trim(),
      shares: draft.shares.filter(hasShareSubject),
    })
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Nuova cartella dashboard' : 'Modifica cartella'}
      subtitle="Folder flat dedicate alle dashboard, separate da quelle report."
      accentLabel="Dashboard builder"
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Salvataggio...' : 'Salva cartella'}
          </button>
        </>
      )}
    >
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Label
          <input
            type="text"
            value={draft.label}
            onChange={(event) => {
              setDraft((current) => ({ ...current, label: event.target.value }))
              setError(null)
            }}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Access mode
          <select
            value={draft.accessMode}
            onChange={(event) => {
              const nextAccessMode = event.target.value as FolderDraft['accessMode']
              setDraft((current) => ({
                ...current,
                accessMode: nextAccessMode,
                shares: nextAccessMode === 'shared' ? current.shares : [],
              }))
              setError(null)
            }}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          >
            <option value="personal">Personal</option>
            <option value="shared">Shared</option>
          </select>
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Description
        <textarea
          value={draft.description}
          onChange={(event) => {
            setDraft((current) => ({ ...current, description: event.target.value }))
            setError(null)
          }}
          rows={3}
          className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
        />
      </label>

      {draft.accessMode === 'shared' ? (
        <div className="mt-4">
          <ShareGrantEditor
            appId={appId}
            value={draft.shares}
            onChange={(shares) => {
              setDraft((current) => ({ ...current, shares }))
              setError(null)
            }}
          />
        </div>
      ) : null}
    </ModalShell>
  )
}

function DashboardEditorModal({
  appId,
  folderOptions,
  busy,
  mode,
  value,
  onClose,
  onSave,
}: {
  appId: string
  folderOptions: DashboardFolderSummary[]
  busy: boolean
  mode: 'create'
  value: DashboardDraft
  onClose: () => void
  onSave: (value: DashboardDraft) => void
}) {
  const [draft, setDraft] = useState<DashboardDraft>(value)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    try {
      dashboardDraftToPayload(draft)
      setError(null)
      onSave({
        ...draft,
        label: draft.label.trim(),
        description: draft.description.trim(),
        sourceReportId: draft.sourceReportId.trim(),
        shares: draft.shares.filter(hasShareSubject),
      })
    } catch (formError) {
      setError(formError instanceof Error ? formError.message : 'Configurazione dashboard non valida')
    }
  }

  return (
    <ModalShell
      title="Nuova dashboard"
      subtitle="Dashboard multi-widget basata su un singolo source report, con filtri globali e layout persistito."
      accentLabel="Dashboard builder"
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Creazione...' : 'Crea dashboard'}
          </button>
        </>
      )}
    >
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <DashboardEditorForm
        appId={appId}
        folderOptions={folderOptions}
        mode={mode}
        value={draft}
        onChange={(nextDraft) => {
          setDraft(nextDraft)
          setError(null)
        }}
      />
    </ModalShell>
  )
}

function DashboardEditorForm({
  appId,
  folderOptions,
  value,
  mode,
  onChange,
}: {
  appId: string
  folderOptions: Array<Pick<DashboardFolderSummary, 'id' | 'label'>>
  value: DashboardDraft
  mode: 'create' | 'edit'
  onChange: (value: DashboardDraft) => void
}) {
  const setFilters = (filters: DashboardFilterDefinition[]) => onChange({ ...value, filters })
  const setWidgets = (widgets: DashboardWidgetDefinition[]) => onChange({ ...value, widgets })

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Folder
            <select
              value={value.folderId}
              onChange={(event) => onChange({ ...value, folderId: event.target.value })}
              className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            >
              <option value="">Seleziona cartella</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Source report
            <SourceReportInput
              appId={appId}
              disabled={mode === 'edit'}
              value={value.sourceReportId}
              onChange={(sourceReportId) => onChange({ ...value, sourceReportId })}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Label
            <input
              type="text"
              value={value.label}
              onChange={(event) => onChange({ ...value, label: event.target.value })}
              className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Description
          <textarea
            value={value.description}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
            rows={3}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </label>
      </section>

      <RepeaterSection
        title="Filtri globali"
        description="Da uno a tre filtri equality-based, caricati dai valori distinti del source report."
        onAdd={() => {
          if (value.filters.length >= MAX_DASHBOARD_FILTERS) {
            return
          }

          setFilters([...value.filters, { field: '', label: '' }])
        }}
      >
        {value.filters.map((filter, index) => (
          <div key={`filter-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="text-sm font-medium text-slate-700">
              Field
              <SourceReportFieldInput
                appId={appId}
                reportId={value.sourceReportId}
                filterableOnly
                value={filter.field}
                onChange={(field) => {
                  const next = [...value.filters]
                  next[index] = { ...filter, field }
                  setFilters(next)
                }}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Label
              <input
                type="text"
                value={filter.label ?? ''}
                onChange={(event) => {
                  const next = [...value.filters]
                  next[index] = { ...filter, label: event.target.value }
                  setFilters(next)
                }}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setFilters(value.filters.filter((_, entryIndex) => entryIndex !== index))}
                className="rounded-2xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Rimuovi
              </button>
            </div>
          </div>
        ))}
      </RepeaterSection>

      <DashboardWidgetEditor appId={appId} reportId={value.sourceReportId} widgets={value.widgets} onChange={setWidgets} />

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Share mode
            <select
              value={value.shareMode}
              onChange={(event) =>
                onChange({
                  ...value,
                  shareMode: event.target.value as DashboardDraft['shareMode'],
                  shares: event.target.value === 'restricted' ? value.shares : [],
                })
              }
              className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            >
              <option value="inherit">Inherit folder</option>
              <option value="restricted">Restricted</option>
              <option value="personal">Personal</option>
            </select>
          </label>
        </div>

        {value.shareMode === 'restricted' ? (
          <div className="mt-4">
            <ShareGrantEditor
              appId={appId}
              value={value.shares}
              onChange={(shares) => onChange({ ...value, shares })}
            />
          </div>
        ) : null}
      </section>
    </div>
  )
}

function DashboardWidgetEditor({
  appId,
  reportId,
  widgets,
  onChange,
}: {
  appId: string
  reportId: string
  widgets: DashboardWidgetDefinition[]
  onChange: (value: DashboardWidgetDefinition[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const widgetIds = useMemo(() => widgets.map((widget) => widget.id), [widgets])

  const updateWidget = (widgetId: string, nextWidget: DashboardWidgetDefinition) => {
    onChange(widgets.map((widget) => (widget.id === widgetId ? nextWidget : widget)))
  }

  const removeWidget = (widgetId: string) => {
    onChange(widgets.filter((widget) => widget.id !== widgetId))
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = widgets.findIndex((widget) => widget.id === active.id)
    const newIndex = widgets.findIndex((widget) => widget.id === over.id)

    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    onChange(arrayMove(widgets, oldIndex, newIndex))
  }

  const addWidget = (kind: WidgetEditorKind) => {
    onChange([...widgets, createEmptyWidget(kind, widgets)])
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Widgets</p>
          <p className="mt-1 text-sm text-slate-500">
            KPI, chart e table con layout grid 12 colonne. Riordino via drag &amp; drop, coordinate persistite nel builder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addWidget('kpi')}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            + KPI
          </button>
          <button
            type="button"
            onClick={() => addWidget('chart')}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            + Chart
          </button>
          <button
            type="button"
            onClick={() => addWidget('table-grouped')}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            + Grouped table
          </button>
          <button
            type="button"
            onClick={() => addWidget('table-rows')}
            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            + Rows table
          </button>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          Aggiungi almeno un widget per salvare la dashboard.
        </div>
      ) : (
        <div className="mt-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={widgetIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {widgets.map((widget) => (
                  <SortableWidgetCard
                    key={widget.id}
                    appId={appId}
                    reportId={reportId}
                    widget={widget}
                    onChange={(nextWidget) => updateWidget(widget.id, nextWidget)}
                    onRemove={() => removeWidget(widget.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </section>
  )
}

function SortableWidgetCard({
  appId,
  reportId,
  widget,
  onChange,
  onRemove,
}: {
  appId: string
  reportId: string
  widget: DashboardWidgetDefinition
  onChange: (value: DashboardWidgetDefinition) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: widget.id,
  })

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Drag
          </button>
          <div>
            <p className="text-sm font-semibold text-slate-900">{widget.title || widget.id}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-slate-500">{describeWidgetDefinition(widget)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-2xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
        >
          Rimuovi
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          Widget ID
          <input
            type="text"
            value={widget.id}
            onChange={(event) => onChange(renameWidget(widget, event.target.value))}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Titolo
          <input
            type="text"
            value={widget.title}
            onChange={(event) => onChange({ ...widget, title: event.target.value })}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Tipo
          <select
            value={toWidgetEditorKind(widget)}
            onChange={(event) => onChange(convertWidgetKind(widget, event.target.value as WidgetEditorKind))}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          >
            <option value="kpi">KPI</option>
            <option value="chart">Chart</option>
            <option value="table-grouped">Grouped table</option>
            <option value="table-rows">Rows table</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <LayoutInput
          label="Grid X"
          value={widget.layout.x}
          onChange={(nextValue) => onChange({ ...widget, layout: { ...widget.layout, x: nextValue } })}
        />
        <LayoutInput
          label="Grid Y"
          value={widget.layout.y}
          onChange={(nextValue) => onChange({ ...widget, layout: { ...widget.layout, y: nextValue } })}
        />
        <LayoutInput
          label="Width"
          value={widget.layout.w}
          min={1}
          max={12}
          onChange={(nextValue) => onChange({ ...widget, layout: { ...widget.layout, w: nextValue } })}
        />
        <LayoutInput
          label="Height"
          value={widget.layout.h}
          min={1}
          max={8}
          onChange={(nextValue) => onChange({ ...widget, layout: { ...widget.layout, h: nextValue } })}
        />
      </div>

      {widget.type === 'kpi' ? (
        <div className="mt-4">
          <MetricEditor appId={appId} reportId={reportId} value={widget.metric} onChange={(metric) => onChange({ ...widget, metric })} />
        </div>
      ) : null}

      {widget.type === 'chart' ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Chart type
              <select
                value={widget.chartType}
                onChange={(event) =>
                  onChange({
                    ...widget,
                    chartType: event.target.value as DashboardChartWidgetDefinition['chartType'],
                  })
                }
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              >
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
                <option value="donut">Donut</option>
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Dimension field
              <SourceReportFieldInput
                appId={appId}
                reportId={reportId}
                value={widget.dimensionField}
                onChange={(dimensionField) => onChange({ ...widget, dimensionField })}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Dimension label
              <input
                type="text"
                value={widget.dimensionLabel ?? ''}
                onChange={(event) => onChange({ ...widget, dimensionLabel: event.target.value })}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
            </label>
          </div>

          <MetricEditor appId={appId} reportId={reportId} value={widget.metric} onChange={(metric) => onChange({ ...widget, metric })} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Limit
              <input
                type="number"
                min={1}
                max={50}
                value={widget.limit ?? ''}
                onChange={(event) => onChange({ ...widget, limit: parseOptionalPositiveInteger(event.target.value) })}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Sort direction
              <select
                value={widget.sortDirection ?? 'DESC'}
                onChange={(event) =>
                  onChange({
                    ...widget,
                    sortDirection: event.target.value as DashboardChartWidgetDefinition['sortDirection'],
                  })
                }
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              >
                <option value="DESC">DESC</option>
                <option value="ASC">ASC</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {widget.type === 'table' && widget.displayMode === 'grouped' ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Dimension field
              <SourceReportFieldInput
                appId={appId}
                reportId={reportId}
                value={widget.dimensionField}
                onChange={(dimensionField) => onChange({ ...widget, dimensionField })}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Dimension label
              <input
                type="text"
                value={widget.dimensionLabel ?? ''}
                onChange={(event) => onChange({ ...widget, dimensionLabel: event.target.value })}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Sort direction
              <select
                value={widget.sortDirection ?? 'DESC'}
                onChange={(event) =>
                  onChange({
                    ...widget,
                    sortDirection: event.target.value as DashboardTableGroupedWidgetDefinition['sortDirection'],
                  })
                }
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              >
                <option value="DESC">DESC</option>
                <option value="ASC">ASC</option>
              </select>
            </label>
          </div>

          <MetricEditor appId={appId} reportId={reportId} value={widget.metric} onChange={(metric) => onChange({ ...widget, metric })} />

          <label className="text-sm font-medium text-slate-700">
            Limit
            <input
              type="number"
              min={1}
              max={50}
              value={widget.limit ?? ''}
              onChange={(event) => onChange({ ...widget, limit: parseOptionalPositiveInteger(event.target.value) })}
              className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </label>
        </div>
      ) : null}

      {widget.type === 'table' && widget.displayMode === 'rows' ? (
        <div className="mt-4 space-y-4">
          <RepeaterSection
            title="Columns"
            description="Campi visibili nella tabella righe."
            onAdd={() => onChange({ ...widget, columns: [...widget.columns, { field: '', label: '' }] })}
          >
            {widget.columns.map((column, index) => (
              <div key={`${widget.id}-column-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="text-sm font-medium text-slate-700">
                  Field
                  <SourceReportFieldInput
                    appId={appId}
                    reportId={reportId}
                    value={column.field}
                    onChange={(field) => {
                      const nextColumns = [...widget.columns]
                      nextColumns[index] = { ...column, field }
                      onChange({ ...widget, columns: nextColumns })
                    }}
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Label
                  <input
                    type="text"
                    value={column.label ?? ''}
                    onChange={(event) => {
                      const nextColumns = [...widget.columns]
                      nextColumns[index] = { ...column, label: event.target.value }
                      onChange({ ...widget, columns: nextColumns })
                    }}
                    className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => onChange({ ...widget, columns: widget.columns.filter((_, entryIndex) => entryIndex !== index) })}
                    className="rounded-2xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                  >
                    Rimuovi
                  </button>
                </div>
              </div>
            ))}
          </RepeaterSection>

          <label className="text-sm font-medium text-slate-700">
            Limit
            <input
              type="number"
              min={1}
              max={50}
              value={widget.limit ?? ''}
              onChange={(event) => onChange({ ...widget, limit: parseOptionalPositiveInteger(event.target.value) })}
              className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </label>
        </div>
      ) : null}
    </article>
  )
}

function LayoutInput({
  label,
  value,
  min = 0,
  max = 99,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(clamp(parseIntegerOrZero(event.target.value), min, max))}
        className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
      />
    </label>
  )
}

function MetricEditor({
  appId,
  reportId,
  value,
  onChange,
}: {
  appId: string
  reportId: string
  value: DashboardMetricDefinition
  onChange: (value: DashboardMetricDefinition) => void
}) {
  const requiresField = value.operation !== 'COUNT'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          Operazione
          <select
            value={value.operation}
            onChange={(event) => {
              const operation = event.target.value as DashboardMetricDefinition['operation']
              onChange({
                operation,
                field: operation === 'COUNT' ? undefined : value.field,
                label: value.label,
              })
            }}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          >
            <option value="COUNT">COUNT</option>
            <option value="SUM">SUM</option>
            <option value="AVG">AVG</option>
            <option value="MIN">MIN</option>
            <option value="MAX">MAX</option>
          </select>
        </label>

        {requiresField ? (
          <label className="text-sm font-medium text-slate-700">
            Field
            <SourceReportFieldInput
              appId={appId}
              reportId={reportId}
              numericOnly
              value={value.field ?? ''}
              onChange={(field) => onChange({ ...value, field })}
            />
          </label>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            `COUNT` non richiede un campo numerico.
          </div>
        )}

        <label className="text-sm font-medium text-slate-700">
          Label
          <input
            type="text"
            value={value.label ?? ''}
            onChange={(event) => onChange({ ...value, label: event.target.value })}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </label>
      </div>
    </div>
  )
}

function RepeaterSection({
  title,
  description,
  onAdd,
  children,
}: {
  title: string
  description: string
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          + Aggiungi
        </button>
      </div>

      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

function ShareGrantEditor({
  appId,
  value,
  onChange,
}: {
  appId: string
  value: ReportShareGrant[]
  onChange: (value: ReportShareGrant[]) => void
}) {
  const shares = value.length > 0 ? value : [EMPTY_SHARE]

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Share grants</p>
          <p className="mt-1 text-sm text-slate-500">
            Condividi con contatti Salesforce o ACL permissions esistenti.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...shares, { subjectType: 'permission', subjectId: '' }])}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          + Share
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {shares.map((share, index) => (
          <div key={`share-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[10rem_minmax(0,1fr)_auto]">
            <label className="text-sm font-medium text-slate-700">
              Tipo
              <select
                value={share.subjectType}
                onChange={(event) => {
                  const next = [...shares]
                  next[index] = { subjectType: event.target.value as ReportShareGrant['subjectType'], subjectId: '' }
                  onChange(next)
                }}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              >
                <option value="permission">Permission</option>
                <option value="contact">Contact</option>
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Subject
              <ShareSubjectInput
                appId={appId}
                subjectType={share.subjectType}
                value={share.subjectId}
                onChange={(subjectId) => {
                  const next = [...shares]
                  next[index] = { ...share, subjectId }
                  onChange(next)
                }}
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => onChange(shares.filter((_, entryIndex) => entryIndex !== index))}
                className="rounded-2xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Rimuovi
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SourceReportInput({
  appId,
  value,
  disabled,
  onChange,
}: {
  appId: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const listId = useId()
  const [suggestions, setSuggestions] = useState<DashboardSourceReportSuggestion[]>([])
  const visibleSuggestions = disabled || value.trim().length < 1 ? [] : suggestions

  useEffect(() => {
    const query = value.trim()
    if (disabled || query.length < 1) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void searchDashboardSourceReports(appId, query, 20)
        .then((payload) => {
          if (!cancelled) {
            setSuggestions(payload.items ?? [])
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([])
          }
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [appId, disabled, value])

  return (
    <>
      <input
        list={disabled ? undefined : listId}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={disabled ? 'Source report fisso dopo la creazione' : 'Cerca report accessibile'}
        className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
      {!disabled ? (
        <datalist id={listId}>
          {visibleSuggestions.map((suggestion) => (
            <option key={suggestion.id} value={suggestion.id}>
              {suggestion.label} · {suggestion.folderLabel} · {suggestion.objectApiName}
            </option>
          ))}
        </datalist>
      ) : null}
    </>
  )
}

function SourceReportFieldInput({
  appId,
  reportId,
  value,
  filterableOnly = false,
  numericOnly = false,
  onChange,
}: {
  appId: string
  reportId: string
  value: string
  filterableOnly?: boolean
  numericOnly?: boolean
  onChange: (value: string) => void
}) {
  const listId = useId()
  const [suggestions, setSuggestions] = useState<DashboardFieldSuggestion[]>([])
  const visibleSuggestions = !reportId.trim() ? [] : suggestions

  useEffect(() => {
    const normalizedReportId = reportId.trim()
    if (!normalizedReportId) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void searchDashboardFields(appId, normalizedReportId, value.trim(), 25)
        .then((payload) => {
          if (cancelled) {
            return
          }

          let items = payload.items ?? []
          if (filterableOnly) {
            items = items.filter((item) => item.filterable)
          }
          if (numericOnly) {
            items = items.filter((item) => NUMERIC_FIELD_TYPES.has(item.type.toLowerCase()))
          }
          setSuggestions(items)
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([])
          }
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [appId, filterableOnly, numericOnly, reportId, value])

  return (
    <>
      <input
        list={listId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={reportId.trim() ? 'Seleziona un campo del report sorgente' : 'Seleziona prima il source report'}
        className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
      />
      <datalist id={listId}>
        {visibleSuggestions.map((suggestion) => (
          <option key={suggestion.name} value={suggestion.name}>
            {suggestion.label}
          </option>
        ))}
      </datalist>
    </>
  )
}

function ShareSubjectInput({
  appId,
  subjectType,
  value,
  onChange,
}: {
  appId: string
  subjectType: ReportShareGrant['subjectType']
  value: string
  onChange: (value: string) => void
}) {
  const listId = useId()
  const [permissionSuggestions, setPermissionSuggestions] = useState<ReportPermissionSuggestion[]>([])
  const [contactSuggestions, setContactSuggestions] = useState<ReportContactSuggestion[]>([])
  const visiblePermissionSuggestions =
    subjectType === 'permission' && value.trim().length >= 2 ? permissionSuggestions : []
  const visibleContactSuggestions =
    subjectType === 'contact' && value.trim().length >= 2 ? contactSuggestions : []

  useEffect(() => {
    const query = value.trim()
    if (query.length < 2) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      const loader =
        subjectType === 'permission'
          ? searchDashboardPermissions(appId, query, 12)
          : searchDashboardContacts(appId, query, 8)

      void loader
        .then((payload) => {
          if (cancelled) {
            return
          }

          if (subjectType === 'permission') {
            setPermissionSuggestions(payload.items as ReportPermissionSuggestion[])
            setContactSuggestions([])
          } else {
            setContactSuggestions(payload.items as ReportContactSuggestion[])
            setPermissionSuggestions([])
          }
        })
        .catch(() => {
          if (cancelled) {
            return
          }

          setPermissionSuggestions([])
          setContactSuggestions([])
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [appId, subjectType, value])

  return (
    <>
      <input
        list={listId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={subjectType === 'permission' ? 'Permission code' : 'Contact Id o nome'}
        className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
      />
      <datalist id={listId}>
        {subjectType === 'permission'
          ? visiblePermissionSuggestions.map((suggestion) => (
              <option key={suggestion.code} value={suggestion.code}>
                {suggestion.label ?? suggestion.code}
              </option>
            ))
          : visibleContactSuggestions.map((suggestion) => (
              <option key={suggestion.id} value={suggestion.id}>
                {suggestion.name ?? suggestion.id}
              </option>
            ))}
      </datalist>
    </>
  )
}

function ModalShell({
  title,
  subtitle,
  children,
  footer,
  onClose,
  accentLabel,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  accentLabel: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{accentLabel}</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Chiudi
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  )
}

function WorkspaceState({
  title,
  description,
  tone = 'neutral',
}: {
  title: string
  description: string
  tone?: 'neutral' | 'error'
}) {
  return (
    <section
      className={`rounded-3xl border px-6 py-6 shadow-sm ${
        tone === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-white/90 text-slate-700'
      }`}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm">{description}</p>
    </section>
  )
}

function createEmptyFolderDraft(): FolderDraft {
  return {
    label: '',
    description: '',
    accessMode: 'personal',
    shares: [],
  }
}

function createFolderDraftFromSummary(folder: DashboardFolderSummary): FolderDraft {
  return {
    label: folder.label,
    description: folder.description ?? '',
    accessMode: folder.accessMode,
    shares: [...folder.shares],
  }
}

function createEmptyDashboardDraft(folderId: string): DashboardDraft {
  const initialWidget = createEmptyWidget('kpi', [])

  return {
    folderId,
    sourceReportId: '',
    label: '',
    description: '',
    filters: [],
    widgets: [initialWidget],
    shareMode: 'inherit',
    shares: [],
  }
}

function createDashboardDraftFromDefinition(dashboard: DashboardDefinition): DashboardDraft {
  return {
    folderId: dashboard.folderId,
    sourceReportId: dashboard.sourceReportId,
    label: dashboard.label,
    description: dashboard.description ?? '',
    filters: dashboard.filters.map((filter) => ({ ...filter })),
    widgets: dashboard.widgets.map(cloneWidget),
    shareMode: dashboard.shareMode,
    shares: [...dashboard.shares],
  }
}

function folderDraftToPayload(draft: FolderDraft): UpsertDashboardFolderPayload {
  const label = draft.label.trim()
  if (!label) {
    throw new Error('Label cartella obbligatoria')
  }

  const shares = draft.shares.filter(hasShareSubject)
  if (draft.accessMode === 'shared' && shares.length === 0) {
    throw new Error('Le cartelle condivise richiedono almeno uno share grant')
  }

  return {
    folder: {
      label,
      description: trimToUndefined(draft.description),
      accessMode: draft.accessMode,
      shares,
    },
  }
}

function dashboardDraftToPayload(draft: DashboardDraft): UpsertDashboardPayload {
  const folderId = draft.folderId.trim()
  const sourceReportId = draft.sourceReportId.trim()
  const label = draft.label.trim()

  if (!folderId) {
    throw new Error('Folder obbligatoria')
  }

  if (!sourceReportId) {
    throw new Error('Source report obbligatorio')
  }

  if (!label) {
    throw new Error('Label dashboard obbligatoria')
  }

  if (draft.filters.length > MAX_DASHBOARD_FILTERS) {
    throw new Error(`Sono supportati al massimo ${MAX_DASHBOARD_FILTERS} filtri globali`)
  }

  if (draft.widgets.length === 0) {
    throw new Error('La dashboard richiede almeno un widget')
  }

  const filters = draft.filters.map((filter, index) => {
    const field = filter.field.trim()
    if (!field) {
      throw new Error(`Filtro ${index + 1}: field obbligatorio`)
    }

    return {
      field,
      label: trimToUndefined(filter.label),
    } satisfies DashboardFilterDefinition
  })

  const shares = draft.shares.filter(hasShareSubject)
  if (draft.shareMode === 'restricted' && shares.length === 0) {
    throw new Error('Le dashboard restricted richiedono almeno uno share grant')
  }

  return {
    dashboard: {
      folderId,
      sourceReportId,
      label,
      description: trimToUndefined(draft.description),
      filters,
      widgets: draft.widgets.map((widget, index) => normalizeWidget(widget, index)),
      shareMode: draft.shareMode,
      shares,
    },
  }
}

function normalizeWidget(widget: DashboardWidgetDefinition, index: number): DashboardWidgetDefinition {
  const id = widget.id.trim()
  const title = widget.title.trim()

  if (!id) {
    throw new Error(`Widget ${index + 1}: id obbligatorio`)
  }

  if (!title) {
    throw new Error(`Widget ${index + 1}: titolo obbligatorio`)
  }

  const layout = normalizeWidgetLayout(widget.layout, id, index)

  if (widget.type === 'kpi') {
    return {
      id,
      type: 'kpi',
      title,
      layout,
      metric: normalizeMetric(widget.metric, index),
    }
  }

  if (widget.type === 'chart') {
    const dimensionField = widget.dimensionField.trim()
    if (!dimensionField) {
      throw new Error(`Widget ${index + 1}: dimension field obbligatorio`)
    }

    return {
      ...widget,
      id,
      title,
      layout,
      dimensionField,
      dimensionLabel: trimToUndefined(widget.dimensionLabel),
      metric: normalizeMetric(widget.metric, index),
      limit: clampOptionalLimit(widget.limit, index),
      sortDirection: widget.sortDirection ?? 'DESC',
    }
  }

  if (widget.displayMode === 'grouped') {
    const dimensionField = widget.dimensionField.trim()
    if (!dimensionField) {
      throw new Error(`Widget ${index + 1}: dimension field obbligatorio`)
    }

    return {
      ...widget,
      id,
      title,
      layout,
      dimensionField,
      dimensionLabel: trimToUndefined(widget.dimensionLabel),
      metric: normalizeMetric(widget.metric, index),
      limit: clampOptionalLimit(widget.limit, index),
      sortDirection: widget.sortDirection ?? 'DESC',
    }
  }

  if (widget.columns.length === 0) {
    throw new Error(`Widget ${index + 1}: la rows table richiede almeno una colonna`)
  }

  return {
    ...widget,
    id,
    title,
    layout,
    columns: widget.columns.map((column, columnIndex) => {
      const field = column.field.trim()
      if (!field) {
        throw new Error(`Widget ${index + 1}: colonna ${columnIndex + 1} senza field`)
      }

      return {
        field,
        label: trimToUndefined(column.label),
      }
    }),
    limit: clampOptionalLimit(widget.limit, index),
  }
}

function normalizeMetric(metric: DashboardMetricDefinition, widgetIndex: number): DashboardMetricDefinition {
  if (metric.operation === 'COUNT') {
    return {
      operation: 'COUNT',
      label: trimToUndefined(metric.label),
    }
  }

  const field = metric.field?.trim() ?? ''
  if (!field) {
    throw new Error(`Widget ${widgetIndex + 1}: il campo metrica è obbligatorio per ${metric.operation}`)
  }

  return {
    operation: metric.operation,
    field,
    label: trimToUndefined(metric.label),
  }
}

function normalizeWidgetLayout(layout: DashboardWidgetLayout, widgetId: string, widgetIndex: number): DashboardWidgetLayout {
  const x = clamp(Math.trunc(layout.x), 0, 11)
  const y = clamp(Math.trunc(layout.y), 0, 99)
  const w = clamp(Math.trunc(layout.w), 1, 12)
  const h = clamp(Math.trunc(layout.h), 1, 8)

  if (!widgetId) {
    throw new Error(`Widget ${widgetIndex + 1}: widgetId layout obbligatorio`)
  }

  return {
    widgetId,
    x,
    y,
    w,
    h,
  }
}

function clampOptionalLimit(limit: number | undefined, widgetIndex: number): number | undefined {
  if (limit === undefined || limit === null) {
    return undefined
  }

  const normalized = Math.trunc(limit)
  if (!Number.isFinite(normalized) || normalized < 1 || normalized > 50) {
    throw new Error(`Widget ${widgetIndex + 1}: limit deve essere compreso tra 1 e 50`)
  }

  return normalized
}

function buildDashboardItemBasePath(appId: string, itemId: string): string {
  return `/app/${encodeURIComponent(appId)}/items/${encodeURIComponent(itemId)}`
}

function buildDashboardFolderPath(basePath: string, folderId: string): string {
  return `${basePath}/folders/${encodeURIComponent(folderId)}`
}

function buildDashboardPath(basePath: string, dashboardId: string): string {
  return `${basePath}/dashboards/${encodeURIComponent(dashboardId)}`
}

function parseDashboardRoute(nestedPath: string): DashboardRouteSelection {
  const normalizedPath = nestedPath.trim().replace(/^\/+|\/+$/g, '')
  if (!normalizedPath) {
    return { kind: 'workspace' }
  }

  const segments = normalizedPath.split('/')
  if (segments.length !== 2) {
    return { kind: 'invalid' }
  }

  const scope = segments[0]
  const id = decodeURIComponent(segments[1] ?? '').trim()
  if (!id) {
    return { kind: 'invalid' }
  }

  if (scope === 'folders') {
    return { kind: 'folder', folderId: id }
  }

  if (scope === 'dashboards') {
    return { kind: 'dashboard', dashboardId: id }
  }

  return { kind: 'invalid' }
}

function hasShareSubject(share: ReportShareGrant): boolean {
  return share.subjectId.trim().length > 0
}

function trimToUndefined(value: string | undefined | null): string | undefined {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : undefined
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('it-IT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return value
  }
}

function formatRunValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False'
  }

  if (typeof value === 'number') {
    return formatNumericValue(value)
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

function formatNumericValue(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value)
}

function formatMetricLabel(metric: DashboardMetricDefinition): string {
  if (metric.label?.trim()) {
    return metric.label.trim()
  }

  return metric.operation === 'COUNT'
    ? 'Record count'
    : `${metric.operation} ${metric.field ?? ''}`.trim()
}

function parseOptionalPositiveInteger(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  const parsed = Number.parseInt(normalized, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parseIntegerOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function encodeScalarValue(value: ReportScalarValue): string {
  return JSON.stringify(value)
}

function decodeAppliedFilters(values: Record<string, string>): DashboardAppliedFilter[] {
  return Object.entries(values)
    .filter(([, encodedValue]) => encodedValue !== '')
    .map(([field, encodedValue]) => ({
      field,
      value: JSON.parse(encodedValue) as ReportScalarValue,
    }))
}

function mapAppliedFiltersToInput(filters: DashboardAppliedFilter[]): Record<string, string> {
  return Object.fromEntries(filters.map((filter) => [filter.field, encodeScalarValue(filter.value)]))
}

function createEmptyWidget(kind: WidgetEditorKind, widgets: DashboardWidgetDefinition[]): DashboardWidgetDefinition {
  const id = createNextWidgetId(widgets)
  const layout = createDefaultLayout(id, widgets.length, kind)

  switch (kind) {
    case 'kpi':
      return {
        id,
        type: 'kpi',
        title: 'Nuovo KPI',
        layout,
        metric: { operation: 'COUNT' },
      }
    case 'chart':
      return {
        id,
        type: 'chart',
        title: 'Nuovo chart',
        layout,
        chartType: 'bar',
        dimensionField: '',
        metric: { operation: 'COUNT' },
        limit: 10,
        sortDirection: 'DESC',
      }
    case 'table-grouped':
      return {
        id,
        type: 'table',
        title: 'Nuova grouped table',
        layout,
        displayMode: 'grouped',
        dimensionField: '',
        metric: { operation: 'COUNT' },
        limit: 10,
        sortDirection: 'DESC',
      }
    case 'table-rows':
      return {
        id,
        type: 'table',
        title: 'Nuova rows table',
        layout,
        displayMode: 'rows',
        columns: [{ field: 'Id', label: 'ID' }],
        limit: 10,
      }
  }
}

function createNextWidgetId(widgets: DashboardWidgetDefinition[]): string {
  const ids = new Set(widgets.map((widget) => widget.id))
  let index = widgets.length + 1
  while (ids.has(`widget-${index}`)) {
    index += 1
  }
  return `widget-${index}`
}

function createDefaultLayout(widgetId: string, index: number, kind: WidgetEditorKind): DashboardWidgetLayout {
  const baseWidth = kind === 'kpi' ? 4 : kind === 'table-rows' ? 12 : 6
  const baseHeight = kind === 'kpi' ? 2 : 4

  return {
    widgetId,
    x: (index % 2) * 6,
    y: Math.floor(index / 2) * 4,
    w: baseWidth,
    h: baseHeight,
  }
}

function cloneWidget(widget: DashboardWidgetDefinition): DashboardWidgetDefinition {
  if (widget.type === 'kpi') {
    return {
      ...widget,
      layout: { ...widget.layout },
      metric: { ...widget.metric },
    }
  }

  if (widget.type === 'chart') {
    return {
      ...widget,
      layout: { ...widget.layout },
      metric: { ...widget.metric },
    }
  }

  if (widget.displayMode === 'grouped') {
    return {
      ...widget,
      layout: { ...widget.layout },
      metric: { ...widget.metric },
    }
  }

  return {
    ...widget,
    layout: { ...widget.layout },
    columns: widget.columns.map((column) => ({ ...column })),
  }
}

function renameWidget(widget: DashboardWidgetDefinition, nextId: string): DashboardWidgetDefinition {
  return {
    ...widget,
    id: nextId,
    layout: {
      ...widget.layout,
      widgetId: nextId,
    },
  }
}

function toWidgetEditorKind(widget: DashboardWidgetDefinition): WidgetEditorKind {
  if (widget.type === 'kpi') {
    return 'kpi'
  }
  if (widget.type === 'chart') {
    return 'chart'
  }
  return widget.displayMode === 'rows' ? 'table-rows' : 'table-grouped'
}

function convertWidgetKind(widget: DashboardWidgetDefinition, nextKind: WidgetEditorKind): DashboardWidgetDefinition {
  const layout = { ...widget.layout }
  const id = widget.id
  const title = widget.title

  switch (nextKind) {
    case 'kpi':
      return {
        id,
        type: 'kpi',
        title,
        layout,
        metric: widget.type === 'kpi' ? widget.metric : { operation: 'COUNT' },
      }
    case 'chart':
      return {
        id,
        type: 'chart',
        title,
        layout,
        chartType: widget.type === 'chart' ? widget.chartType : 'bar',
        dimensionField: widget.type === 'chart' ? widget.dimensionField : '',
        dimensionLabel: widget.type === 'chart' ? widget.dimensionLabel : undefined,
        metric: widget.type === 'kpi' ? { ...widget.metric } : widget.type === 'chart' ? widget.metric : { operation: 'COUNT' },
        limit: widget.type === 'chart' ? widget.limit : 10,
        sortDirection: widget.type === 'chart' ? widget.sortDirection : 'DESC',
      }
    case 'table-grouped':
      return {
        id,
        type: 'table',
        title,
        layout,
        displayMode: 'grouped',
        dimensionField: widget.type === 'chart' ? widget.dimensionField : '',
        dimensionLabel: widget.type === 'chart' ? widget.dimensionLabel : undefined,
        metric: widget.type === 'kpi' ? { ...widget.metric } : widget.type === 'chart' ? widget.metric : widget.type === 'table' && widget.displayMode === 'grouped' ? widget.metric : { operation: 'COUNT' },
        limit: widget.type === 'table' && widget.displayMode === 'grouped' ? widget.limit : 10,
        sortDirection: widget.type === 'table' && widget.displayMode === 'grouped' ? widget.sortDirection : 'DESC',
      }
    case 'table-rows':
      return {
        id,
        type: 'table',
        title,
        layout,
        displayMode: 'rows',
        columns: widget.type === 'table' && widget.displayMode === 'rows' ? widget.columns : [{ field: 'Id', label: 'ID' }],
        limit: widget.type === 'table' && widget.displayMode === 'rows' ? widget.limit : 10,
      }
  }
}

function describeWidgetDefinition(widget: DashboardWidgetDefinition): string {
  if (widget.type === 'kpi') {
    return `${widget.type} · ${widget.metric.operation}`
  }

  if (widget.type === 'chart') {
    return `${widget.chartType} · ${widget.metric.operation}${widget.metric.field ? ` ${widget.metric.field}` : ''}`
  }

  if (widget.displayMode === 'grouped') {
    return `table grouped · ${widget.metric.operation}${widget.metric.field ? ` ${widget.metric.field}` : ''}`
  }

  return `table rows · ${widget.columns.length} colonne`
}

function compareWidgetLayout(a: DashboardWidgetDefinition, b: DashboardWidgetDefinition): number {
  if (a.layout.y !== b.layout.y) {
    return a.layout.y - b.layout.y
  }

  if (a.layout.x !== b.layout.x) {
    return a.layout.x - b.layout.x
  }

  return a.title.localeCompare(b.title)
}

function buildWidgetGridStyle(layout: DashboardWidgetLayout): CSSProperties {
  const startColumn = clamp(layout.x, 0, 11) + 1
  const columnSpan = clamp(layout.w, 1, 12 - startColumn + 1)
  const rowStart = clamp(layout.y, 0, 99) + 1
  const rowSpan = clamp(layout.h, 1, 8)

  return {
    gridColumn: `${startColumn} / span ${columnSpan}`,
    gridRow: `${rowStart} / span ${rowSpan}`,
    minHeight: `${rowSpan * 72}px`,
  }
}
