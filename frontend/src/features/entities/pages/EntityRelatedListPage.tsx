import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  deleteEntityRecord,
  fetchEntityConfig,
  fetchEntityRelatedList,
} from '../entity-api'
import {
  getRecordsFromCollection,
  normalizeEntityBasePath,
  resolveActionTarget,
  toTitleCase,
} from '../entity-helpers'
import type {
  EntityAction,
  EntityConfigEnvelope,
  EntityRelatedListResponse,
  EntityRecord,
  RelatedListConfig,
} from '../entity-types'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityRecordTable } from '../components/EntityRecordTable'
import { EntityStatePanel } from '../components/EntityStatePanel'

export function EntityRelatedListPage() {
  const { entityId = '', recordId = '', relatedListId = '' } = useParams()
  const [config, setConfig] = useState<EntityConfigEnvelope | null>(null)
  const [relatedPayload, setRelatedPayload] = useState<EntityRelatedListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRelatedList = useCallback(async () => {
    if (!entityId || !recordId || !relatedListId) {
      return
    }

    try {
      setLoading(true)

      const [entityConfig, relatedResponse] = await Promise.all([
        fetchEntityConfig(entityId),
        fetchEntityRelatedList(entityId, recordId, relatedListId),
      ])

      setConfig(entityConfig)
      setRelatedPayload(relatedResponse)
      setError(null)
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Errore caricamento related list'
      setError(message)
      setConfig(null)
      setRelatedPayload(null)
    } finally {
      setLoading(false)
    }
  }, [entityId, recordId, relatedListId])

  useEffect(() => {
    void loadRelatedList()
  }, [loadRelatedList])

  const configRelatedList = useMemo<RelatedListConfig | undefined>(
    () => config?.entity.detail?.relatedLists?.find((item) => item.id === relatedListId),
    [config?.entity.detail?.relatedLists, relatedListId],
  )

  const relatedList = relatedPayload?.relatedList ?? configRelatedList
  const relatedEntityId = relatedList?.entityId ?? entityId
  const entityLabel = config?.entity.label ?? toTitleCase(entityId)
  const baseEntityPath = normalizeEntityBasePath(entityId, config?.entity.navigation?.basePath)
  const title =
    relatedPayload?.title ??
    relatedList?.label ??
    `${toTitleCase(relatedListId)} - View all`

  const records = getRecordsFromCollection(relatedPayload ?? {})
  const columns = relatedPayload?.columns ?? relatedList?.columns ?? []
  const rowActions = relatedPayload?.rowActions ?? relatedList?.rowActions
  const actions = relatedPayload?.actions ?? relatedList?.actions ?? []
  const emptyMessage = relatedPayload?.emptyState ?? relatedList?.emptyState ?? 'Nessun record collegato'

  if (!entityId || !recordId || !relatedListId) {
    return (
      <EntityPageFrame
        title="Related list non valida"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Entity' }]}
      >
        <EntityStatePanel
          tone="error"
          title="Parametri route mancanti"
          description="Servono entityId, recordId e relatedListId."
        />
      </EntityPageFrame>
    )
  }

  return (
    <EntityPageFrame
      title={title}
      subtitle={`${entityLabel} - ${recordId}`}
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: entityLabel, to: baseEntityPath },
        { label: recordId, to: `${baseEntityPath}/${recordId}` },
        { label: 'Related List' },
      ]}
    >
      {actions.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action, index) => (
              <RelatedPageActionButton
                key={`${action.type}-${action.label ?? action.target ?? index}`}
                action={action}
                recordId={recordId}
                baseEntityPath={`/s/${relatedEntityId}`}
              />
            ))}
          </div>
        </section>
      )}

      {loading && <EntityStatePanel title="Caricamento related list in corso..." />}
      {!loading && error && (
        <EntityStatePanel tone="error" title="Related list non disponibile" description={error} />
      )}
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
    </EntityPageFrame>
  )
}

type RelatedPageActionButtonProps = {
  action: EntityAction
  baseEntityPath: string
  recordId: string
}

function RelatedPageActionButton({ action, baseEntityPath, recordId }: RelatedPageActionButtonProps) {
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
      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      {action.label ?? 'Open'}
    </Link>
  )
}
