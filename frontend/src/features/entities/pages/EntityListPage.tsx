import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  deleteEntityRecord,
  fetchEntityConfig,
  fetchEntityList,
} from '../entity-api'
import { getRecordsFromCollection, toTitleCase } from '../entity-helpers'
import type {
  EntityConfigEnvelope,
  EntityListResponse,
  EntityRecord,
} from '../entity-types'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityRecordTable } from '../components/EntityRecordTable'
import { EntityStatePanel } from '../components/EntityStatePanel'

export function EntityListPage() {
  const { entityId = '' } = useParams()
  const [config, setConfig] = useState<EntityConfigEnvelope | null>(null)
  const [listResponse, setListResponse] = useState<EntityListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const loadList = useCallback(
    async (search = '') => {
      if (!entityId) {
        return
      }

      try {
        setLoading(true)
        const [entityConfig, listPayload] = await Promise.all([
          fetchEntityConfig(entityId),
          fetchEntityList(entityId, {
            search: search.length > 0 ? search : undefined,
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
    [entityId],
  )

  useEffect(() => {
    void loadList()
  }, [loadList])

  const records = useMemo(
    () => getRecordsFromCollection(listResponse ?? {}),
    [listResponse],
  )

  const entityLabel = config?.entity.label ?? toTitleCase(entityId)
  const listTitle = listResponse?.title ?? config?.entity.list?.title ?? `${entityLabel} List`
  const listSubtitle = listResponse?.subtitle ?? config?.entity.list?.subtitle
  const listColumns = listResponse?.columns ?? []

  const handleDelete = useCallback(
    async (record: EntityRecord) => {
      const recordId = String(record.Id ?? record.id ?? '')
      if (!recordId) {
        return
      }

      await deleteEntityRecord(entityId, recordId)
      await loadList(searchTerm)
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
        <Link
          to={`/s/${entityId}/new`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          New
        </Link>
      }
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            void loadList(searchTerm)
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

      {loading && <EntityStatePanel title="Caricamento list view in corso..." />}
      {!loading && error && (
        <EntityStatePanel tone="error" title="List view non disponibile" description={error} />
      )}
      {!loading && !error && (
        <EntityRecordTable
          columns={listColumns}
          records={records}
          emptyMessage="Nessun record disponibile"
          baseEntityPath={`/s/${entityId}`}
          onDelete={handleDelete}
        />
      )}
    </EntityPageFrame>
  )
}
