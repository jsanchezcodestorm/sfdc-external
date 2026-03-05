import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import {
  deleteEntityRecord,
  fetchEntityConfig,
  fetchEntityRelatedList,
} from '../entity-api'
import { getRecordsFromCollection, toTitleCase } from '../entity-helpers'
import type {
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
  const title =
    relatedPayload?.title ??
    relatedList?.label ??
    `${toTitleCase(relatedListId)} - View all`

  const records = getRecordsFromCollection(relatedPayload ?? {})
  const columns = relatedPayload?.columns ?? relatedList?.columns ?? []

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
        { label: entityLabel, to: `/s/${entityId}` },
        { label: recordId, to: `/s/${entityId}/${recordId}` },
        { label: 'Related List' },
      ]}
    >
      {loading && <EntityStatePanel title="Caricamento related list in corso..." />}
      {!loading && error && (
        <EntityStatePanel tone="error" title="Related list non disponibile" description={error} />
      )}
      {!loading && !error && (
        <EntityRecordTable
          columns={columns}
          records={records}
          emptyMessage="Nessun record collegato"
          baseEntityPath={`/s/${relatedEntityId}`}
          actions={relatedList?.rowActions}
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
