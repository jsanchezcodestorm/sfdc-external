import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import {
  deleteEntityRecord,
  fetchEntityConfig,
  fetchEntityList,
  isInvalidEntityCursorError,
} from '../entity-api'
import {
  getRecordsFromCollection,
  resolveActionTarget,
  selectListView,
  toTitleCase,
} from '../entity-helpers'
import { buildAppEntityBasePath, buildAppHomePath } from '../../apps/app-workspace-routing'
import type {
  EntityAction,
  EntityConfigEnvelope,
  EntityListResponse,
  EntityRecord,
} from '../entity-types'
import { EntityCursorPaginationControls } from '../components/EntityCursorPaginationControls'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityRecordTable } from '../components/EntityRecordTable'
import { EntityStatePanel } from '../components/EntityStatePanel'

export function EntityListPage() {
  const { appId = '', entityId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const [config, setConfig] = useState<EntityConfigEnvelope | null>(null)
  const [listResponse, setListResponse] = useState<EntityListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const recoveryKeyRef = useRef<string | null>(null)

  const requestedViewId = useMemo(() => {
    const raw = searchParams.get('viewId')?.trim()
    return raw && raw.length > 0 ? raw : undefined
  }, [searchParams])

  const requestedSearch = useMemo(() => {
    const raw = searchParams.get('search')?.trim()
    return raw && raw.length > 0 ? raw : ''
  }, [searchParams])

  const requestedCursor = useMemo(() => {
    const raw = searchParams.get('cursor')?.trim()
    return raw && raw.length > 0 ? raw : undefined
  }, [searchParams])

  const filterSignature = useMemo(
    () => `${entityId}::${requestedViewId ?? ''}::${requestedSearch}`,
    [entityId, requestedSearch, requestedViewId],
  )

  const updateSearchState = useCallback(
    (next: { cursor?: string | null; search?: string; viewId?: string }) => {
      const nextParams = new URLSearchParams()
      const normalizedViewId = next.viewId?.trim()
      const normalizedSearch = next.search?.trim()
      const normalizedCursor = next.cursor?.trim()

      if (normalizedViewId) {
        nextParams.set('viewId', normalizedViewId)
      }

      if (normalizedSearch) {
        nextParams.set('search', normalizedSearch)
      }

      if (normalizedCursor) {
        nextParams.set('cursor', normalizedCursor)
      }

      setSearchParams(nextParams)
    },
    [setSearchParams],
  )

  useEffect(() => {
    setSearchTerm(requestedSearch)
  }, [requestedSearch])

  useEffect(() => {
    setCursorHistory([])
    recoveryKeyRef.current = null
  }, [filterSignature])

  const loadList = useCallback(
    async () => {
      if (!entityId) {
        return
      }

      try {
        setLoading(true)
        const [entityConfig, listPayload] = await Promise.all([
          fetchEntityConfig(entityId),
          fetchEntityList(entityId, {
            viewId: requestedViewId,
            cursor: requestedCursor,
            search: requestedSearch.length > 0 ? requestedSearch : undefined,
          }),
        ])

        setConfig(entityConfig)
        setListResponse(listPayload)
        setError(null)
      } catch (loadError) {
        if (requestedCursor && isInvalidEntityCursorError(loadError)) {
          const recoveryKey = `${filterSignature}::${requestedCursor}`
          if (recoveryKeyRef.current !== recoveryKey) {
            recoveryKeyRef.current = recoveryKey
            setCursorHistory([])
            updateSearchState({
              viewId: requestedViewId,
              search: requestedSearch,
              cursor: null,
            })
            return
          }
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Errore caricamento entity list'
        setError(message)
        setConfig(null)
        setListResponse(null)
      } finally {
        setLoading(false)
      }
    },
    [entityId, filterSignature, requestedCursor, requestedSearch, requestedViewId, updateSearchState],
  )

  useEffect(() => {
    void loadList()
  }, [loadList])

  const records = useMemo(
    () => getRecordsFromCollection(listResponse ?? {}),
    [listResponse],
  )

  const entityLabel = config?.entity.label ?? toTitleCase(entityId)
  const baseEntityPath = appId ? buildAppEntityBasePath(appId, entityId) : ''
  const selectedView = selectListView(config?.entity.list, listResponse?.viewId ?? requestedViewId)
  const views = config?.entity.list?.views ?? []

  const listTitle = listResponse?.title ?? config?.entity.list?.title ?? `${entityLabel} List`
  const listSubtitle = listResponse?.subtitle ?? config?.entity.list?.subtitle
  const listColumns = listResponse?.columns ?? selectedView?.columns ?? []
  const rowActions = listResponse?.rowActions ?? selectedView?.rowActions
  const primaryAction =
    listResponse?.primaryAction ??
    selectedView?.primaryAction ??
    config?.entity.list?.primaryAction
  const searchEnabled = Boolean(selectedView?.search)
  const canGoPrevious = cursorHistory.length > 0
  const hasNextPage = Boolean(listResponse?.nextCursor)

  const handleDelete = useCallback(
    async (record: EntityRecord) => {
      const recordId = String(record.Id ?? record.id ?? '')
      if (!recordId) {
        return
      }

      await deleteEntityRecord(entityId, recordId)
      setCursorHistory([])
      updateSearchState({
        viewId: requestedViewId,
        search: requestedSearch,
        cursor: null,
      })
    },
    [entityId, requestedSearch, requestedViewId, updateSearchState],
  )

  if (!entityId) {
    return (
        <EntityPageFrame
        title="Entity non valida"
        breadcrumbs={[{ label: 'Launcher', to: '/' }, { label: 'Entity' }]}
      >
        <EntityStatePanel
          tone="error"
          title="Parametro entityId mancante"
          description="Verifica la route e riprova."
        />
      </EntityPageFrame>
    )
  }

  return (
    <EntityPageFrame
      title={listTitle}
      subtitle={listSubtitle}
      breadcrumbs={[
        { label: 'Launcher', to: '/' },
        { label: 'App', to: appId ? buildAppHomePath(appId) : undefined },
        { label: entityLabel },
      ]}
      actions={
        primaryAction ? (
          <ListPrimaryActionButton action={primaryAction} baseEntityPath={baseEntityPath} />
        ) : undefined
      }
    >
      {views.length > 1 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
            View
            <select
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              value={selectedView?.id ?? ''}
              onChange={(event) => {
                const nextViewId = event.target.value
                setCursorHistory([])
                updateSearchState({
                  viewId: nextViewId || undefined,
                  search: requestedSearch,
                  cursor: null,
                })
              }}
            >
              {views.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {searchEnabled && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              setCursorHistory([])
              updateSearchState({
                viewId: requestedViewId,
                search: searchTerm,
                cursor: null,
              })
            }}
          >
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search records"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Search
            </button>
          </form>
        </section>
      )}

      {loading && <EntityStatePanel title="Caricamento list view in corso..." />}
      {!loading && error && (
        <EntityStatePanel tone="error" title="List view non disponibile" description={error} />
      )}
      {!loading && !error && (
        <EntityRecordTable
          columns={listColumns}
          records={records}
          emptyMessage="Nessun record disponibile"
          baseEntityPath={baseEntityPath}
          actions={rowActions}
          onDelete={handleDelete}
        />
      )}
      {!loading && !error && (
        <EntityCursorPaginationControls
          canGoPrevious={canGoPrevious}
          hasNextPage={hasNextPage}
          total={listResponse?.total}
          onPrevious={() => {
            const previousCursor = cursorHistory.at(-1)
            if (previousCursor === undefined) {
              return
            }

            setCursorHistory((current) => current.slice(0, -1))
            updateSearchState({
              viewId: requestedViewId,
              search: requestedSearch,
              cursor: previousCursor || null,
            })
          }}
          onNext={() => {
            const nextCursor = listResponse?.nextCursor
            if (!nextCursor) {
              return
            }

            setCursorHistory((current) => [...current, requestedCursor ?? ''])
            updateSearchState({
              viewId: requestedViewId,
              search: requestedSearch,
              cursor: nextCursor,
            })
          }}
        />
      )}
    </EntityPageFrame>
  )
}

type ListPrimaryActionButtonProps = {
  action: EntityAction
  baseEntityPath: string
}

function ListPrimaryActionButton({ action, baseEntityPath }: ListPrimaryActionButtonProps) {
  if (action.type === 'delete') {
    return null
  }

  const target = resolveActionTarget(action, {
    baseEntityPath,
    fallbackPath: `${baseEntityPath}/new`,
  })

  return (
    <Link
      to={target}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
    >
      {action.label ?? 'Open'}
    </Link>
  )
}
