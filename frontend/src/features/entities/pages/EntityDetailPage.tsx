import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deleteEntityRecord,
  fetchEntityConfig,
  fetchEntityRecord,
  updateEntityRecord,
} from '../entity-api'
import {
  formatFieldValue,
  formatFieldValueByFormat,
  normalizeEntityBasePath,
  renderRecordTemplate,
  resolveActionTarget,
  resolveDisplayFieldValue,
  resolveFieldValue,
  toLabel,
  toTitleCase,
} from '../entity-helpers'
import type {
  DetailSectionConfig,
  EntityAction,
  EntityConfigEnvelope,
  EntityDetailResponse,
  EntityRecord,
  PathStatusConfig,
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
  const [pathUpdatingValue, setPathUpdatingValue] = useState<string | null>(null)

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
  const baseEntityPath = normalizeEntityBasePath(entityId, config?.entity.navigation?.basePath)
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

  const detailActions = useMemo<EntityAction[]>(() => {
    if (detailResponse?.actions && detailResponse.actions.length > 0) {
      return detailResponse.actions
    }

    return config?.entity.detail?.actions ?? []
  }, [config?.entity.detail?.actions, detailResponse?.actions])

  const pathStatus = useMemo<PathStatusConfig | undefined>(() => {
    return detailResponse?.pathStatus ?? config?.entity.detail?.pathStatus
  }, [config?.entity.detail?.pathStatus, detailResponse?.pathStatus])

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
        { label: entityLabel, to: baseEntityPath },
        { label: recordId },
      ]}
      actions={
        detailActions.length > 0 ? (
          <DetailActions
            actions={detailActions}
            record={record}
            recordId={recordId}
            baseEntityPath={baseEntityPath}
            deleting={deleting}
            onDelete={async () => {
              const confirmDelete = window.confirm('Confermi eliminazione del record?')
              if (!confirmDelete) {
                return
              }

              setDeleting(true)

              try {
                await deleteEntityRecord(entityId, recordId)
                navigate(baseEntityPath)
              } catch (deleteError: unknown) {
                const message =
                  deleteError instanceof Error ? deleteError.message : 'Errore eliminazione record'
                setError(message)
              } finally {
                setDeleting(false)
              }
            }}
          />
        ) : undefined
      }
    >
      {loading && <EntityStatePanel title="Caricamento detail in corso..." />}
      {!loading && error && (
        <EntityStatePanel tone="error" title="Detail non disponibile" description={error} />
      )}
      {!loading && !error && (
        <>
          {pathStatus && (
            <PathStatusPanel
              pathStatus={pathStatus}
              record={record}
              updatingValue={pathUpdatingValue}
              onSelect={async (nextValue) => {
                if (pathStatus.field.includes('.')) {
                  return
                }

                setPathUpdatingValue(nextValue)

                try {
                  await updateEntityRecord(entityId, recordId, {
                    [pathStatus.field]: nextValue,
                  })
                  await loadDetail()
                } catch (updateError) {
                  const message =
                    updateError instanceof Error
                      ? updateError.message
                      : 'Errore aggiornamento path status'
                  setError(message)
                } finally {
                  setPathUpdatingValue(null)
                }
              }}
            />
          )}

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
                    const rawDisplayValue = field.field ? resolveDisplayFieldValue(record, field.field) : undefined
                    const fieldValue = field.template
                      ? renderRecordTemplate(field.template, record)
                      : formatFieldValueByFormat(rawDisplayValue, field.format)

                    return (
                      <article
                        key={fieldKey}
                        className={`rounded-xl border border-slate-200 p-3 ${field.highlight ? 'bg-sky-50' : 'bg-slate-50'}`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                          {fieldLabel}
                        </p>
                        <p className={`mt-1 text-sm ${field.highlight ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                          {fieldValue.length > 0 ? fieldValue : formatFieldValue(rawDisplayValue)}
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
                baseEntityPath={baseEntityPath}
                relatedList={relatedList}
              />
            ))}
          </section>
        </>
      )}
    </EntityPageFrame>
  )
}

type DetailActionsProps = {
  actions: EntityAction[]
  baseEntityPath: string
  recordId: string
  record: EntityRecord
  deleting: boolean
  onDelete: () => Promise<void>
}

function DetailActions({
  actions,
  baseEntityPath,
  recordId,
  record,
  deleting,
  onDelete,
}: DetailActionsProps) {
  return (
    <>
      {actions.map((action, index) => {
        if (action.type === 'delete') {
          return (
            <button
              key={`${action.type}-${action.label ?? index}`}
              type="button"
              onClick={() => {
                void onDelete()
              }}
              disabled={deleting}
              className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : action.label ?? 'Delete'}
            </button>
          )
        }

        const target = resolveActionTarget(action, {
          baseEntityPath,
          fallbackPath:
            action.type === 'edit'
              ? `${baseEntityPath}/${recordId}/edit`
              : `${baseEntityPath}/${recordId}`,
          record,
          rowId: recordId,
        })

        return (
          <Link
            key={`${action.type}-${action.label ?? action.target ?? index}`}
            to={target}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {action.label ?? (action.type === 'edit' ? 'Edit' : 'Open')}
          </Link>
        )
      })}
    </>
  )
}

type PathStatusPanelProps = {
  pathStatus: PathStatusConfig
  record: EntityRecord
  updatingValue: string | null
  onSelect: (value: string) => Promise<void>
}

function PathStatusPanel({ pathStatus, record, updatingValue, onSelect }: PathStatusPanelProps) {
  const steps = pathStatus.steps ?? []

  if (!pathStatus.field || steps.length === 0) {
    return null
  }

  const currentValue = String(resolveFieldValue(record, pathStatus.field) ?? '')
  const activeStepIndex = steps.findIndex((step) => step.value === currentValue)
  const allowUpdate = pathStatus.allowUpdate !== false && !pathStatus.field.includes('.')

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Path Status</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {steps.map((step, index) => {
          const stepLabel = step.label ?? step.value
          const isActive = currentValue === step.value
          const isPassed = activeStepIndex >= 0 && index <= activeStepIndex
          const isUpdating = updatingValue === step.value

          return (
            <button
              key={step.value}
              type="button"
              disabled={!allowUpdate || isActive || isUpdating}
              onClick={() => {
                if (!allowUpdate || isActive) {
                  return
                }

                void onSelect(step.value)
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                isActive
                  ? 'border-sky-600 bg-sky-600 text-white'
                  : isPassed
                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                    : 'border-slate-300 bg-white text-slate-600'
              } ${allowUpdate ? 'hover:border-sky-400' : 'cursor-default opacity-85'}`}
            >
              {isUpdating ? 'Updating...' : stepLabel}
            </button>
          )
        })}
      </div>
    </section>
  )
}
