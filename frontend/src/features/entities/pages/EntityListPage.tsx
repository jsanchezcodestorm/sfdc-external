import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import {
  deleteEntityRecord,
  fetchEntityConfig,
  fetchEntityList,
} from '../entity-api'
import {
  getRecordsFromCollection,
  normalizeEntityBasePath,
  resolveActionTarget,
  selectListView,
  toTitleCase,
} from '../entity-helpers'
import type {
  EntityAction,
  EntityConfigEnvelope,
  EntityListResponse,
  EntityRecord,
} from '../entity-types'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityRecordTable } from '../components/EntityRecordTable'
import { EntityStatePanel } from '../components/EntityStatePanel'

export function EntityListPage() {
  const { entityId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const [config, setConfig] = useState<EntityConfigEnvelope | null>(null)
  const [listResponse, setListResponse] = useState<EntityListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const requestedViewId = useMemo(() => {
    const raw = searchParams.get('viewId')?.trim()
    return raw && raw.length > 0 ? raw : undefined
  }, [searchParams])

  const loadList = useCallback(
    async (options: { search?: string; viewId?: string } = {}) => {
      if (!entityId) {
        return
      }

      const effectiveSearch = options.search ?? ''
      const effectiveViewId = options.viewId ?? requestedViewId

      try {
        setLoading(true)
        const [entityConfig, listPayload] = await Promise.all([
          fetchEntityConfig(entityId),
          fetchEntityList(entityId, {
            viewId: effectiveViewId,
            search: effectiveSearch.length > 0 ? effectiveSearch : undefined,
          }),
        ])

        setConfig(entityConfig)
        setListResponse(listPayload)
        setError(null)
      } catch (loadError) {
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
    [entityId, requestedViewId],
  )

  useEffect(() => {
    void loadList()
  }, [loadList])

  const records = useMemo(
    () => getRecordsFromCollection(listResponse ?? {}),
    [listResponse],
  )

  const entityLabel = config?.entity.label ?? toTitleCase(entityId)
  const baseEntityPath = normalizeEntityBasePath(entityId, config?.entity.navigation?.basePath)
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

  const handleDelete = useCallback(
    async (record: EntityRecord) => {
      const recordId = String(record.Id ?? record.id ?? '')
      if (!recordId) {
        return
      }

      await deleteEntityRecord(entityId, recordId)
      await loadList({ search: searchTerm })
    },
    [entityId, loadList, searchTerm],
  )

  if (!entityId) {
    return (
      <EntityPageFrame
        title="Entity non valida"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Entity' }]}
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
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: entityLabel }]}
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
                const nextParams = new URLSearchParams(searchParams)

                if (nextViewId.length > 0) {
                  nextParams.set('viewId', nextViewId)
                } else {
                  nextParams.delete('viewId')
                }

                setSearchParams(nextParams)
                void loadList({ search: searchTerm, viewId: nextViewId || undefined })
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
              void loadList({ search: searchTerm })
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
