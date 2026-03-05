import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deleteEntityRecord,
  fetchEntityConfig,
  fetchEntityRecord,
} from '../entity-api'
import {
  formatFieldValue,
  formatFieldValueByFormat,
  renderRecordTemplate,
  resolveFieldValue,
  toLabel,
  toTitleCase,
} from '../entity-helpers'
import type {
  DetailSectionConfig,
  EntityConfigEnvelope,
  EntityDetailResponse,
  EntityRecord,
  RelatedListConfig,
} from '../entity-types'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityRelatedListCard } from '../components/EntityRelatedListCard'
import { EntityStatePanel } from '../components/EntityStatePanel'

export function EntityDetailPage() {
  const navigate = useNavigate()
  const { entityId = '', recordId = '' } = useParams()
  const [config, setConfig] = useState<EntityConfigEnvelope | null>(null)
  const [detailResponse, setDetailResponse] = useState<EntityDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!entityId || !recordId) {
      return
    }

    try {
      setLoading(true)
      const [entityConfig, detailPayload] = await Promise.all([
        fetchEntityConfig(entityId),
        fetchEntityRecord(entityId, recordId),
      ])

      setConfig(entityConfig)
      setDetailResponse(detailPayload)
      setError(null)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Errore caricamento detail'
      setError(message)
      setConfig(null)
      setDetailResponse(null)
    } finally {
      setLoading(false)
    }
  }, [entityId, recordId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const record = useMemo<EntityRecord>(
    () => (detailResponse?.record ?? detailResponse?.data ?? {}) as EntityRecord,
    [detailResponse?.data, detailResponse?.record],
  )
  const entityLabel = config?.entity.label ?? toTitleCase(entityId)
  const headerTitle =
    detailResponse?.title ?? String(record.Name ?? record.name ?? `${entityLabel} Detail`)
  const detailSections = useMemo<DetailSectionConfig[]>(() => {
    if (detailResponse?.sections && detailResponse.sections.length > 0) {
      return detailResponse.sections
    }

    if (config?.entity.detail?.sections && config.entity.detail.sections.length > 0) {
      return config.entity.detail.sections
    }

    return []
  }, [config?.entity.detail?.sections, detailResponse?.sections])

  const relatedLists = useMemo<RelatedListConfig[]>(() => {
    if (detailResponse?.relatedLists && detailResponse.relatedLists.length > 0) {
      return detailResponse.relatedLists
    }

    return config?.entity.detail?.relatedLists ?? []
  }, [config?.entity.detail?.relatedLists, detailResponse?.relatedLists])

  if (!entityId || !recordId) {
    return (
      <EntityPageFrame
        title="Detail non valida"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Entity' }]}
      >
        <EntityStatePanel
          tone="error"
          title="Parametri route mancanti"
          description="Servono entityId e recordId per aprire il dettaglio."
        />
      </EntityPageFrame>
    )
  }

  return (
    <EntityPageFrame
      title={headerTitle}
      subtitle={`${entityLabel} - ${recordId}`}
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: entityLabel, to: `/s/${entityId}` },
        { label: recordId },
      ]}
      actions={
        <>
          <Link
            to={`/s/${entityId}/${recordId}/edit`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={() => {
              const confirmDelete = window.confirm('Confermi eliminazione del record?')
              if (!confirmDelete) {
                return
              }

              setDeleting(true)
              void deleteEntityRecord(entityId, recordId)
                .then(() => {
                  navigate(`/s/${entityId}`)
                })
                .catch((deleteError: unknown) => {
                  const message =
                    deleteError instanceof Error ? deleteError.message : 'Errore eliminazione record'
                  setError(message)
                })
                .finally(() => {
                  setDeleting(false)
                })
            }}
            disabled={deleting}
            className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </>
      }
    >
      {loading && <EntityStatePanel title="Caricamento detail in corso..." />}
      {!loading && error && (
        <EntityStatePanel tone="error" title="Detail non disponibile" description={error} />
      )}
      {!loading && !error && (
        <>
          <section className="flex flex-col gap-4">
            {detailSections.map((section) => (
              <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                  {section.title}
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {section.fields.map((field) => {
                    const fieldKey = field.field ?? field.template ?? field.label ?? 'field'
                    const fieldLabel = field.label ?? (field.field ? toLabel(field.field) : 'Value')
                    const fieldValue = field.template
                      ? renderRecordTemplate(field.template, record)
                      : formatFieldValueByFormat(resolveFieldValue(record, field.field ?? ''), field.format)

                    return (
                      <article
                        key={fieldKey}
                        className={`rounded-xl border border-slate-200 p-3 ${field.highlight ? 'bg-sky-50' : 'bg-slate-50'}`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                          {fieldLabel}
                        </p>
                        <p className={`mt-1 text-sm ${field.highlight ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                          {fieldValue.length > 0 ? fieldValue : formatFieldValue(resolveFieldValue(record, field.field ?? ''))}
                        </p>
                      </article>
                    )
                  })}
                </div>
              </article>
            ))}
            {detailSections.length === 0 && (
              <EntityStatePanel title="Nessuna sezione detail configurata" />
            )}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
              Related Lists
            </h2>
            {relatedLists.length === 0 && (
              <EntityStatePanel title="Nessuna related list configurata" />
            )}
            {relatedLists.map((relatedList) => (
              <EntityRelatedListCard
                key={relatedList.id}
                entityId={entityId}
                recordId={recordId}
                relatedList={relatedList}
              />
            ))}
          </section>
        </>
      )}
    </EntityPageFrame>
  )
}
