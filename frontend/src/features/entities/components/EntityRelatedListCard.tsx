import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { deleteEntityRecord, fetchEntityRelatedList } from '../entity-api'
import { getRecordsFromCollection } from '../entity-helpers'
import type { EntityRelatedListResponse, EntityRecord, RelatedListConfig } from '../entity-types'
import { EntityRecordTable } from './EntityRecordTable'
import { EntityStatePanel } from './EntityStatePanel'

type EntityRelatedListCardProps = {
  entityId: string
  recordId: string
  relatedList: RelatedListConfig
}

export function EntityRelatedListCard({
  entityId,
  recordId,
  relatedList,
}: EntityRelatedListCardProps) {
  const [payload, setPayload] = useState<EntityRelatedListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const relatedEntityId = relatedList.entityId ?? entityId

  const loadRelatedList = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetchEntityRelatedList(entityId, recordId, relatedList.id, { pageSize: 5 })
      setPayload(response)
      setError(null)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Errore caricamento related list'
      setError(message)
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [entityId, recordId, relatedList.id])

  useEffect(() => {
    void loadRelatedList()
  }, [loadRelatedList])

  const records = getRecordsFromCollection(payload ?? {})
  const columns = payload?.columns ?? relatedList.columns ?? []

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{relatedList.label}</h3>
          {relatedList.description && <p className="mt-1 text-sm text-slate-600">{relatedList.description}</p>}
        </div>
        <Link
          to={`/s/${entityId}/${recordId}/related/${relatedList.id}`}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          View all
        </Link>
      </div>

      {loading && <EntityStatePanel title="Caricamento related list in corso..." />}
      {!loading && error && <EntityStatePanel tone="error" title="Related list non disponibile" description={error} />}
      {!loading && !error && (
        <EntityRecordTable
          columns={columns}
          records={records}
          emptyMessage="Nessun record collegato"
          baseEntityPath={`/s/${relatedEntityId}`}
          actions={relatedList.rowActions}
          onDelete={async (record: EntityRecord) => {
            const rowId = String(record.Id ?? record.id ?? '')
            if (!rowId) {
              return
            }

            await deleteEntityRecord(relatedEntityId, rowId)
            await loadRelatedList()
          }}
        />
      )}
    </section>
  )
}
