import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { deleteEntityRecord, fetchEntityRelatedList } from '../entity-api'
import { getRecordsFromCollection, resolveActionTarget } from '../entity-helpers'
import type {
  EntityAction,
  EntityRelatedListResponse,
  EntityRecord,
  RelatedListConfig,
} from '../entity-types'
import { EntityRecordTable } from './EntityRecordTable'
import { EntityStatePanel } from './EntityStatePanel'

type EntityRelatedListCardProps = {
  entityId: string
  recordId: string
  baseEntityPath: string
  relatedList: RelatedListConfig
}

export function EntityRelatedListCard({
  entityId,
  recordId,
  baseEntityPath,
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
  const rowActions = payload?.rowActions ?? relatedList.rowActions
  const actions = payload?.actions ?? relatedList.actions ?? []
  const emptyMessage = payload?.emptyState ?? relatedList.emptyState ?? 'Nessun record collegato'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{relatedList.label}</h3>
          {relatedList.description && <p className="mt-1 text-sm text-slate-600">{relatedList.description}</p>}
        </div>
        <Link
          to={`${baseEntityPath}/${recordId}/related/${relatedList.id}`}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          View all
        </Link>
      </div>

      {actions.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {actions.map((action, index) => (
            <RelatedListActionButton
              key={`${action.type}-${action.label ?? action.target ?? index}`}
              action={action}
              baseEntityPath={`/s/${relatedEntityId}`}
              recordId={recordId}
            />
          ))}
        </div>
      )}

      {loading && <EntityStatePanel title="Caricamento related list in corso..." />}
      {!loading && error && <EntityStatePanel tone="error" title="Related list non disponibile" description={error} />}
      {!loading && !error && (
        <EntityRecordTable
          columns={columns}
          records={records}
          emptyMessage={emptyMessage}
          baseEntityPath={`/s/${relatedEntityId}`}
          actions={rowActions}
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

type RelatedListActionButtonProps = {
  action: EntityAction
  baseEntityPath: string
  recordId: string
}

function RelatedListActionButton({ action, baseEntityPath, recordId }: RelatedListActionButtonProps) {
  if (action.type === 'delete') {
    return null
  }

  const target = resolveActionTarget(action, {
    baseEntityPath,
    fallbackPath: baseEntityPath,
    rowId: recordId,
  })

  return (
    <Link
      to={target}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      {action.label ?? 'Open'}
    </Link>
  )
}
