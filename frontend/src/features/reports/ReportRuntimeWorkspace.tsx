import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAppDialog } from '../../components/app-dialog'
import { useAuth } from '../auth/useAuth'

import {
  createReport,
  createReportFolder,
  deleteReport,
  deleteReportFolder,
  fetchReport,
  fetchReportFolder,
  fetchReportsWorkspace,
  runReport,
  searchReportContacts,
  searchReportFields,
  searchReportObjects,
  searchReportPermissions,
  updateReport,
  updateReportFolder,
} from './report-api'
import {
  createEmptyFolderDraft,
  createEmptyReportDraft,
  createFolderDraftFromSummary,
  createReportDraftFromDefinition,
  folderDraftToPayload,
  hasShareSubject,
  reportDraftToPayload,
} from './report-drafts'
import { ReportRunPanel } from './ReportRunPanel'
import type {
  ReportContactSuggestion,
  ReportFieldSuggestion,
  ReportFilterOperator,
  ReportFolderResponse,
  ReportFolderSummary,
  ReportObjectSuggestion,
  ReportPermissionSuggestion,
  ReportResponse,
  ReportRunResponse,
  ReportsWorkspaceResponse,
  ReportShareGrant,
} from './report-types'
import type {
  FolderDraft,
  FolderEditorState,
  ReportColumnDraft,
  ReportDraft,
  ReportFilterDraft,
  ReportGroupingDraft,
  ReportSortDraft,
} from './report-workspace-model'
import { EMPTY_SHARE, FILTER_OPERATORS } from './report-workspace-model'
import {
  buildReportFolderPath,
  buildReportItemBasePath,
  buildReportPath,
  formatDate,
  parseReportRoute,
} from './report-workspace-utils'

type ReportRuntimeWorkspaceProps = {
  appId: string
  itemId: string
  appLabel: string
  itemLabel: string
  itemDescription?: string
}

export function ReportRuntimeWorkspace({
  appId,
  itemId,
  appLabel,
  itemLabel,
  itemDescription,
}: ReportRuntimeWorkspaceProps) {
  const params = useParams()
  const navigate = useNavigate()
  const { confirm } = useAppDialog()
  const { user } = useAuth()
  const nestedPath = typeof params['*'] === 'string' ? params['*'] : ''
  const routeSelection = useMemo(() => parseReportRoute(nestedPath), [nestedPath])

  const [workspace, setWorkspace] = useState<ReportsWorkspaceResponse | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)

  const [folderData, setFolderData] = useState<ReportFolderResponse | null>(null)
  const [reportData, setReportData] = useState<ReportResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [runData, setRunData] = useState<ReportRunResponse | null>(null)
  const [runLoading, setRunLoading] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const [folderEditorState, setFolderEditorState] = useState<FolderEditorState | null>(null)
  const [createReportOpen, setCreateReportOpen] = useState(false)
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null)
  const [editorMode, setEditorMode] = useState<'run' | 'edit'>('run')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const reportItemBasePath = useMemo(
    () => buildReportItemBasePath(appId, itemId),
    [appId, itemId],
  )
  const currentCanWrite = workspace?.canWrite ?? folderData?.canWrite ?? reportData?.canWrite ?? false
  const canWriteUi = Boolean(user) && currentCanWrite
  const routeReportId = routeSelection.kind === 'report' ? routeSelection.reportId : null
  const routeResetKey = routeSelection.kind === 'report' ? routeSelection.reportId : routeSelection.kind
  const activeFolderId =
    routeSelection.kind === 'folder'
      ? routeSelection.folderId
      : routeSelection.kind === 'report'
        ? reportData?.report.folderId ?? null
        : null

  const refreshWorkspace = useCallback(async () => {
    setWorkspaceLoading(true)
    try {
      const payload = await fetchReportsWorkspace(appId)
      setWorkspace(payload)
      setWorkspaceError(null)
    } catch (error) {
      setWorkspace(null)
      setWorkspaceError(error instanceof Error ? error.message : 'Errore caricamento workspace report')
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
    setReportData(null)
    setRunData(null)

    if (routeSelection.kind === 'workspace') {
      return
    }

    if (routeSelection.kind === 'invalid') {
      setDetailError('Route report non valida')
      return
    }

    let cancelled = false
    setDetailLoading(true)

    const loadPromise =
      routeSelection.kind === 'folder'
        ? fetchReportFolder(appId, routeSelection.folderId)
        : fetchReport(appId, routeSelection.reportId)

    void loadPromise
      .then((payload) => {
        if (cancelled) {
          return
        }

        if (routeSelection.kind === 'folder') {
          setFolderData(payload as ReportFolderResponse)
          setReportData(null)
        } else {
          const typedPayload = payload as ReportResponse
          setReportData(typedPayload)
          setFolderData(null)
          setReportDraft(createReportDraftFromDefinition(typedPayload.report))
        }
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setDetailError(error instanceof Error ? error.message : 'Errore caricamento dettaglio report')
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

  const loadRunPage = useCallback(async (cursor?: string | null) => {
    if (!routeReportId) {
      return
    }

    setRunLoading(true)
    try {
      const payload = await runReport(appId, routeReportId, cursor)
      setRunData(payload)
      setRunError(null)
    } catch (error) {
      setRunData(null)
      setRunError(error instanceof Error ? error.message : 'Errore esecuzione report')
    } finally {
      setRunLoading(false)
    }
  }, [appId, routeReportId])

  useEffect(() => {
    if (!routeReportId || editorMode !== 'run' || !reportData?.report.id) {
      return
    }

    void loadRunPage()
  }, [editorMode, loadRunPage, reportData?.report.id, routeReportId])

  const openCreateFolder = () => {
    setFolderEditorState({
      mode: 'create',
      draft: createEmptyFolderDraft(),
    })
    setActionError(null)
  }

  const openEditFolder = (folder: ReportFolderSummary) => {
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
          ? await updateReportFolder(appId, folderEditorState.folderId, payload)
          : await createReportFolder(appId, payload)

      await refreshWorkspace()
      setFolderEditorState(null)
      navigate(buildReportFolderPath(reportItemBasePath, response.folder.id))
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
      title: 'Elimina cartella report',
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
      await deleteReportFolder(appId, folderData.folder.id)
      await refreshWorkspace()
      navigate(reportItemBasePath)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore eliminazione cartella')
    } finally {
      setActionBusy(false)
    }
  }

  const openCreateReport = (folderId?: string) => {
    setReportDraft(createEmptyReportDraft(folderId ?? activeFolderId ?? workspace?.folders[0]?.id ?? ''))
    setCreateReportOpen(true)
    setActionError(null)
  }

  const saveNewReport = async (draft: ReportDraft) => {
    setActionBusy(true)
    setActionError(null)

    try {
      const payload = reportDraftToPayload(draft)
      const response = await createReport(appId, payload)
      await refreshWorkspace()
      setCreateReportOpen(false)
      setReportDraft(createReportDraftFromDefinition(response.report))
      navigate(buildReportPath(reportItemBasePath, response.report.id))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore creazione report')
    } finally {
      setActionBusy(false)
    }
  }

  const saveExistingReport = async () => {
    if (!reportData?.report.id || !reportDraft) {
      return
    }

    setActionBusy(true)
    setActionError(null)

    try {
      const payload = reportDraftToPayload(reportDraft)
      const response = await updateReport(appId, reportData.report.id, payload)
      await refreshWorkspace()
      setReportData(response)
      setReportDraft(createReportDraftFromDefinition(response.report))
      navigate(buildReportPath(reportItemBasePath, response.report.id))
      setEditorMode('run')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore aggiornamento report')
    } finally {
      setActionBusy(false)
    }
  }

  const removeCurrentReport = async () => {
    if (!reportData?.report.id) {
      return
    }

    const approved = await confirm({
      title: 'Elimina report',
      description: `Eliminare il report ${reportData.report.label}?`,
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
      const folderId = reportData.report.folderId
      await deleteReport(appId, reportData.report.id)
      await refreshWorkspace()
      navigate(buildReportFolderPath(reportItemBasePath, folderId))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Errore eliminazione report')
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

  const renderContent = () => {
    if (workspaceLoading && routeSelection.kind === 'workspace') {
      return <WorkspaceState title="Caricamento report..." description="Sto caricando cartelle e definizioni disponibili." />
    }

    if (workspaceError && !workspace) {
      return <WorkspaceState title="Modulo report non disponibile" description={workspaceError} tone="error" />
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
          basePath={reportItemBasePath}
          onCreateFolder={openCreateFolder}
          onCreateReport={() => openCreateReport()}
        />
      )
    }

    if (routeSelection.kind === 'folder' && folderData) {
      return (
        <FolderView
          folderData={folderData}
          basePath={reportItemBasePath}
          canWrite={canWriteUi}
          actionBusy={actionBusy}
          onCreateReport={() => openCreateReport(folderData.folder.id)}
          onEditFolder={() => openEditFolder(folderData.folder)}
          onDeleteFolder={() => {
            void removeCurrentFolder()
          }}
        />
      )
    }

    if (routeSelection.kind === 'report' && reportData && reportDraft) {
      return (
        <ReportView
          basePath={reportItemBasePath}
          canWrite={canWriteUi}
          editorMode={editorMode}
          actionBusy={actionBusy}
          reportResponse={reportData}
          folderOptions={workspace?.folders ?? []}
          runResponse={runData}
          runLoading={runLoading}
          runError={runError}
          draft={reportDraft}
          onModeChange={setEditorMode}
          onDraftChange={setReportDraft}
          onRefreshRun={() => {
            void loadRunPage()
          }}
          onNextPage={() => {
            void loadRunPage(runData?.nextCursor)
          }}
          onSave={() => {
            void saveExistingReport()
          }}
          onDelete={() => {
            void removeCurrentReport()
          }}
        />
      )
    }

    return <WorkspaceState title="Contenuto non disponibile" description="La route report richiesta non produce un contenuto navigabile." tone="error" />
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{appLabel}</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{itemLabel}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {itemDescription?.trim() || 'Modulo report interno con cartelle condivisibili, builder limitato ed esecuzione paginata.'}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={reportItemBasePath}
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
            <nav className="mt-4 space-y-2" aria-label="Report folders">
              {workspace.folders.map((folder) => (
                <Link
                  key={folder.id}
                  to={buildReportFolderPath(reportItemBasePath, folder.id)}
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
                      {folder.reportCount}
                    </span>
                  </div>
                </Link>
              ))}
            </nav>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Nessuna cartella disponibile in questa app.
            </p>
          )}

          {currentFolderSummary && canWriteUi ? (
            <button
              type="button"
              onClick={() => openCreateReport(currentFolderSummary.id)}
              className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Nuovo report in {currentFolderSummary.label}
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

      {createReportOpen && reportDraft ? (
        <ReportEditorModal
          appId={appId}
          folderOptions={workspace?.folders ?? []}
          busy={actionBusy}
          mode="create"
          value={reportDraft}
          onClose={() => setCreateReportOpen(false)}
          onSave={(nextDraft) => {
            void saveNewReport(nextDraft)
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
  onCreateReport,
}: {
  workspace: ReportsWorkspaceResponse | null
  canWrite: boolean
  basePath: string
  onCreateFolder: () => void
  onCreateReport: () => void
}) {
  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Run + Edit</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Report workspace
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Naviga cartelle e report accessibili, modifica campi, criteri e raggruppamenti nel builder interno, poi esegui il report con paginazione cursor.
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
                onClick={onCreateReport}
                disabled={!workspace?.folders.length}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Nuovo report
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
              to={buildReportFolderPath(basePath, folder.id)}
              className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
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
                <span>{folder.reportCount} report accessibili</span>
                <span>{folder.shares.length} share</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500 xl:col-span-2">
            Nessuna cartella disponibile. Crea la prima cartella per iniziare a definire i report dell&apos;app.
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
  onCreateReport,
  onEditFolder,
  onDeleteFolder,
}: {
  folderData: ReportFolderResponse
  basePath: string
  canWrite: boolean
  actionBusy: boolean
  onCreateReport: () => void
  onEditFolder: () => void
  onDeleteFolder: () => void
}) {
  const { folder, reports } = folderData

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Folder</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{folder.label}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              {folder.description?.trim() || 'Cartella report senza descrizione.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {folder.accessMode === 'shared' ? 'Condivisa' : 'Personale'}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {reports.length} report
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
                onClick={onCreateReport}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Nuovo report
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
            <p className="text-sm font-semibold text-slate-900">Report disponibili</p>
            <p className="mt-1 text-sm text-slate-500">
              Run per tutti gli utenti autorizzati; edit solo per owner o admin.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
            {reports.length}
          </span>
        </div>

        {reports.length ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {reports.map((report) => (
              <Link
                key={report.id}
                to={buildReportPath(basePath, report.id)}
                className="group rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                    {report.objectApiName}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {formatDate(report.updatedAt)}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950 group-hover:text-slate-700">{report.label}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {report.description?.trim() || 'Nessuna descrizione configurata.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{report.columns.length} colonne</span>
                  <span>{report.groupings.length} grouping</span>
                  <span>{report.shareMode}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
            Nessun report in questa cartella.
          </div>
        )}
      </section>
    </>
  )
}

function ReportView({
  basePath,
  canWrite,
  editorMode,
  actionBusy,
  reportResponse,
  folderOptions,
  runResponse,
  runLoading,
  runError,
  draft,
  onModeChange,
  onDraftChange,
  onRefreshRun,
  onNextPage,
  onSave,
  onDelete,
}: {
  basePath: string
  canWrite: boolean
  editorMode: 'run' | 'edit'
  actionBusy: boolean
  reportResponse: ReportResponse
  folderOptions: ReportFolderSummary[]
  runResponse: ReportRunResponse | null
  runLoading: boolean
  runError: string | null
  draft: ReportDraft
  onModeChange: (value: 'run' | 'edit') => void
  onDraftChange: (value: ReportDraft) => void
  onRefreshRun: () => void
  onNextPage: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const report = reportResponse.report

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={buildReportFolderPath(basePath, report.folderId)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 transition hover:border-slate-300 hover:bg-white"
              >
                Torna alla cartella
              </Link>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                {report.objectApiName}
              </span>
            </div>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{report.label}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              {report.description?.trim() || 'Report configurato nel modulo interno dell app.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {report.columns.length} colonne
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {report.filters.length} filtri
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                {report.groupings.length} grouping
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                page size {report.pageSize}
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
            {canWrite && report.canEdit ? (
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
            {canWrite && report.canEdit ? (
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
        <ReportRunPanel
          report={report}
          runResponse={runResponse}
          runLoading={runLoading}
          runError={runError}
          onRefreshRun={onRefreshRun}
          onNextPage={onNextPage}
        />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Builder</p>
              <p className="mt-1 text-sm text-slate-500">
                Modifica subset V1: colonne, criteri, grouping, sort, page size e sharing.
              </p>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={actionBusy}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionBusy ? 'Salvataggio...' : 'Salva report'}
            </button>
          </div>

          <div className="mt-6">
            <ReportEditorForm
              appId={report.appId}
              folderOptions={folderOptions}
              value={draft}
              mode="edit"
              onChange={onDraftChange}
            />
          </div>
        </section>
      )}
    </>
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
      title={mode === 'create' ? 'Nuova cartella report' : 'Modifica cartella'}
      subtitle="Folder flat scoped per app con sharing personale o condiviso."
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
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
          className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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

function ReportEditorModal({
  appId,
  folderOptions,
  busy,
  mode,
  value,
  onClose,
  onSave,
}: {
  appId: string
  folderOptions: ReportFolderSummary[]
  busy: boolean
  mode: 'create'
  value: ReportDraft
  onClose: () => void
  onSave: (value: ReportDraft) => void
}) {
  const [draft, setDraft] = useState<ReportDraft>(value)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    try {
      reportDraftToPayload(draft)
      setError(null)
      onSave({
        ...draft,
        label: draft.label.trim(),
        description: draft.description.trim(),
        objectApiName: draft.objectApiName.trim(),
        shares: draft.shares.filter(hasShareSubject),
      })
    } catch (formError) {
      setError(formError instanceof Error ? formError.message : 'Configurazione report non valida')
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Nuovo report' : 'Report'}
      subtitle="Definizione strutturata app-scoped con compile server-side in SOQL."
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
            {busy ? 'Creazione...' : 'Crea report'}
          </button>
        </>
      )}
    >
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <ReportEditorForm
        appId={appId}
        folderOptions={folderOptions}
        mode="create"
        value={draft}
        onChange={(nextDraft) => {
          setDraft(nextDraft)
          setError(null)
        }}
      />
    </ModalShell>
  )
}

function ReportEditorForm({
  appId,
  folderOptions,
  value,
  mode,
  onChange,
}: {
  appId: string
  folderOptions: Array<Pick<ReportFolderSummary, 'id' | 'label'>>
  value: ReportDraft
  mode: 'create' | 'edit'
  onChange: (value: ReportDraft) => void
}) {
  const setColumns = (columns: ReportColumnDraft[]) => onChange({ ...value, columns })
  const setFilters = (filters: ReportFilterDraft[]) => onChange({ ...value, filters })
  const setGroupings = (groupings: ReportGroupingDraft[]) => onChange({ ...value, groupings })
  const setSort = (sort: ReportSortDraft[]) => onChange({ ...value, sort })

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Folder
          <select
            value={value.folderId}
            onChange={(event) => onChange({ ...value, folderId: event.target.value })}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
          Page size
          <input
            type="number"
            min={1}
            max={2000}
            step={1}
            value={value.pageSize}
            onChange={(event) => onChange({ ...value, pageSize: event.target.value })}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Label
          <input
            type="text"
            value={value.label}
            onChange={(event) => onChange({ ...value, label: event.target.value })}
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Object API Name
          <ReportObjectApiNameInput
            appId={appId}
            disabled={mode === 'edit'}
            value={value.objectApiName}
            onChange={(objectApiName) => onChange({ ...value, objectApiName })}
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Description
        <textarea
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          rows={3}
          className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </label>

      <RepeaterSection
        title="Columns"
        description="Seleziona i campi visibili nel risultato."
        onAdd={() => setColumns([...value.columns, { field: '', label: '' }])}
      >
        {value.columns.map((column, index) => (
          <div key={`column-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="text-sm font-medium text-slate-700">
              Field
              <ReportFieldInput
                appId={appId}
                objectApiName={value.objectApiName}
                value={column.field}
                onChange={(field) => {
                  const next = [...value.columns]
                  next[index] = { ...column, field }
                  setColumns(next)
                }}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Label
              <input
                type="text"
                value={column.label}
                onChange={(event) => {
                  const next = [...value.columns]
                  next[index] = { ...column, label: event.target.value }
                  setColumns(next)
                }}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setColumns(value.columns.filter((_, entryIndex) => entryIndex !== index))}
                className="rounded-2xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Rimuovi
              </button>
            </div>
          </div>
        ))}
      </RepeaterSection>

      <RepeaterSection
        title="Filters"
        description="Supporta operatori del DSL entity: =, !=, <, <=, >, >=, IN, NOT IN, LIKE."
        onAdd={() => setFilters([...value.filters, { field: '', operator: '=', valueText: '' }])}
      >
        {value.filters.map((filter, index) => (
          <div key={`filter-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto]">
            <label className="text-sm font-medium text-slate-700">
              Field
              <ReportFieldInput
                appId={appId}
                objectApiName={value.objectApiName}
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
              Operatore
              <select
                value={filter.operator}
                onChange={(event) => {
                  const next = [...value.filters]
                  next[index] = { ...filter, operator: event.target.value as ReportFilterOperator }
                  setFilters(next)
                }}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                {FILTER_OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Valore
              <input
                type="text"
                value={filter.valueText}
                onChange={(event) => {
                  const next = [...value.filters]
                  next[index] = { ...filter, valueText: event.target.value }
                  setFilters(next)
                }}
                placeholder={filter.operator === 'IN' || filter.operator === 'NOT IN' ? 'a, b, c' : 'null, true, 42, testo'}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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

      <RepeaterSection
        title="Groupings"
        description="Fino a due livelli di grouping con conteggio righe per gruppo."
        onAdd={() => setGroupings([...value.groupings, { field: '', label: '' }])}
      >
        {value.groupings.map((grouping, index) => (
          <div key={`grouping-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="text-sm font-medium text-slate-700">
              Field
              <ReportFieldInput
                appId={appId}
                objectApiName={value.objectApiName}
                value={grouping.field}
                onChange={(field) => {
                  const next = [...value.groupings]
                  next[index] = { ...grouping, field }
                  setGroupings(next)
                }}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Label
              <input
                type="text"
                value={grouping.label}
                onChange={(event) => {
                  const next = [...value.groupings]
                  next[index] = { ...grouping, label: event.target.value }
                  setGroupings(next)
                }}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setGroupings(value.groupings.filter((_, entryIndex) => entryIndex !== index))}
                className="rounded-2xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Rimuovi
              </button>
            </div>
          </div>
        ))}
      </RepeaterSection>

      <RepeaterSection
        title="Sort"
        description="Ordinamento aggiuntivo oltre agli eventuali grouping."
        onAdd={() => setSort([...value.sort, { field: '', direction: 'ASC' }])}
      >
        {value.sort.map((sortEntry, index) => (
          <div key={`sort-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <label className="text-sm font-medium text-slate-700">
              Field
              <ReportFieldInput
                appId={appId}
                objectApiName={value.objectApiName}
                value={sortEntry.field}
                onChange={(field) => {
                  const next = [...value.sort]
                  next[index] = { ...sortEntry, field }
                  setSort(next)
                }}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Direction
              <select
                value={sortEntry.direction}
                onChange={(event) => {
                  const next = [...value.sort]
                  next[index] = { ...sortEntry, direction: event.target.value as 'ASC' | 'DESC' }
                  setSort(next)
                }}
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="ASC">ASC</option>
                <option value="DESC">DESC</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setSort(value.sort.filter((_, entryIndex) => entryIndex !== index))}
                className="rounded-2xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Rimuovi
              </button>
            </div>
          </div>
        ))}
      </RepeaterSection>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Share mode
          <select
            value={value.shareMode}
            onChange={(event) =>
              onChange({
                ...value,
                shareMode: event.target.value as ReportDraft['shareMode'],
                shares: event.target.value === 'restricted' ? value.shares : [],
              })
            }
            className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            <option value="inherit">Inherit folder</option>
            <option value="restricted">Restricted</option>
            <option value="personal">Personal</option>
          </select>
        </label>
      </div>

      {value.shareMode === 'restricted' ? (
        <ShareGrantEditor appId={appId} value={value.shares} onChange={(shares) => onChange({ ...value, shares })} />
      ) : null}
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
                className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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

function ReportObjectApiNameInput({
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
  const [suggestions, setSuggestions] = useState<ReportObjectSuggestion[]>([])
  const visibleSuggestions = disabled || value.trim().length < 2 ? [] : suggestions

  useEffect(() => {
    const query = value.trim()
    if (disabled || query.length < 2) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void searchReportObjects(appId, query, 20)
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
        placeholder={disabled ? 'Object fisso dopo la creazione' : 'Es. Account'}
        className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
      {!disabled ? (
        <datalist id={listId}>
          {visibleSuggestions.map((suggestion) => (
            <option key={suggestion.name} value={suggestion.name}>
              {suggestion.label}
            </option>
          ))}
        </datalist>
      ) : null}
    </>
  )
}

function ReportFieldInput({
  appId,
  objectApiName,
  value,
  filterableOnly = false,
  onChange,
}: {
  appId: string
  objectApiName: string
  value: string
  filterableOnly?: boolean
  onChange: (value: string) => void
}) {
  const listId = useId()
  const [suggestions, setSuggestions] = useState<ReportFieldSuggestion[]>([])
  const visibleSuggestions =
    !objectApiName.trim() || value.trim().length < 1 ? [] : suggestions

  useEffect(() => {
    const objectName = objectApiName.trim()
    const query = value.trim()
    if (!objectName || query.length < 1) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void searchReportFields(appId, objectName, query, 25)
        .then((payload) => {
          if (cancelled) {
            return
          }

          const items = payload.items ?? []
          setSuggestions(filterableOnly ? items.filter((item) => item.filterable) : items)
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
  }, [appId, filterableOnly, objectApiName, value])

  return (
    <>
      <input
        list={listId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={objectApiName.trim() ? 'Es. Name' : 'Seleziona prima object'}
        className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
          ? searchReportPermissions(appId, query, 12)
          : searchReportContacts(appId, query, 8)

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
        className="mt-2 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Report builder</p>
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
