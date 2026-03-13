import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import {
  createEntityRecord,
  fetchEntityConfig,
  fetchEntityCreateLayoutOptions,
  fetchEntityForm,
  updateEntityRecord,
} from '../entity-api'
import {
  getRecordId,
  renderRecordTemplate,
  toTitleCase,
} from '../entity-helpers'
import { buildAppEntityBasePath, buildAppHomePath } from '../../apps/app-workspace-routing'
import type {
  EntityConfigEnvelope,
  EntityCreateLayoutOption,
  EntityRecord,
  EntityFormResponse,
  LookupCondition,
  RuntimeFormSectionConfig,
} from '../entity-types'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityRecordForm } from '../components/EntityRecordForm'
import { EntityStatePanel } from '../components/EntityStatePanel'

export function EntityFormPage() {
  const navigate = useNavigate()
  const { appId = '', entityId = '', recordId } = useParams()
  const [searchParams] = useSearchParams()
  const mode = recordId ? 'edit' : 'create'

  const [config, setConfig] = useState<EntityConfigEnvelope | null>(null)
  const [formResponse, setFormResponse] = useState<EntityFormResponse | null>(null)
  const [createOptions, setCreateOptions] = useState<EntityCreateLayoutOption[]>([])
  const [selectedRecordTypeDeveloperName, setSelectedRecordTypeDeveloperName] = useState('')
  const [initialValues, setInitialValues] = useState<EntityRecord>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadForm = useCallback(async () => {
    if (!entityId) {
      return
    }

    try {
      setLoading(true)

      const entityConfig = await fetchEntityConfig(entityId)
      setConfig(entityConfig)
      let resolvedPayload: EntityFormResponse | null = null

      if (mode === 'create') {
        const optionsResponse = await fetchEntityCreateLayoutOptions(entityId)
        const nextOptions = optionsResponse.items ?? []
        setCreateOptions(nextOptions)

        const nextRecordType =
          selectedRecordTypeDeveloperName ||
          (nextOptions.length === 1 ? nextOptions[0].recordTypeDeveloperName : '')
        if (nextRecordType && nextRecordType !== selectedRecordTypeDeveloperName) {
          setSelectedRecordTypeDeveloperName(nextRecordType)
        }

        if (!nextRecordType) {
          setFormResponse(null)
          setInitialValues({})
          setError(null)
          return
        }

        resolvedPayload = await fetchEntityForm(entityId, undefined, nextRecordType)
        setFormResponse(resolvedPayload)
      } else {
        resolvedPayload = await fetchEntityForm(entityId, recordId)
        setFormResponse(resolvedPayload)
        setCreateOptions([])
      }

      if (resolvedPayload?.values) {
        setInitialValues(resolvedPayload.values)
      } else if (resolvedPayload?.record) {
        setInitialValues(resolvedPayload.record)
      } else {
        setInitialValues({})
      }

      if (recordId && !resolvedPayload?.values && !resolvedPayload?.record) {
        throw new Error('Form edit payload non conforme: values/record mancanti')
      }

      setError(null)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Errore caricamento form'
      setError(message)
      setConfig(null)
      setFormResponse(null)
      setCreateOptions([])
      setInitialValues({})
    } finally {
      setLoading(false)
    }
  }, [entityId, mode, recordId, selectedRecordTypeDeveloperName])

  useEffect(() => {
    void loadForm()
  }, [loadForm])

  const entityLabel = config?.entity.label ?? toTitleCase(entityId)
  const baseEntityPath = appId ? buildAppEntityBasePath(appId, entityId) : ''

  const sections = useMemo<RuntimeFormSectionConfig[]>(
    () => formResponse?.sections ?? [],
    [formResponse?.sections],
  )

  const lookupContext = useMemo<EntityRecord>(() => {
    const context: EntityRecord = {
      entityId,
      id: recordId ?? '',
      recordId: recordId ?? '',
      recordTypeDeveloperName:
        formResponse?.recordTypeDeveloperName ?? selectedRecordTypeDeveloperName,
      parentId: searchParams.get('parentId') ?? '',
      parentRel: searchParams.get('parentRel') ?? '',
    }

    for (const [key, value] of searchParams.entries()) {
      context[key] = value
    }

    return context
  }, [entityId, formResponse?.recordTypeDeveloperName, recordId, searchParams, selectedRecordTypeDeveloperName])

  const initialValuesWithDefaults = useMemo(() => {
    if (mode !== 'create') {
      return initialValues
    }

    return applyFieldDefaults(initialValues, sections)
  }, [initialValues, mode, sections])

  const initialValuesWithLookupPrefill = useMemo(() => {
    if (mode !== 'create') {
      return initialValuesWithDefaults
    }

    return applyLookupPrefill(initialValuesWithDefaults, sections, lookupContext)
  }, [initialValuesWithDefaults, lookupContext, mode, sections])

  const title =
    formResponse?.title ??
    `${mode === 'edit' ? 'Edit' : 'New'} ${entityLabel}`

  const subtitle = formResponse?.subtitle ?? `${entityLabel} - ${mode}`

  if (!entityId) {
    return (
        <EntityPageFrame
        title="Form non valida"
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
      title={title}
      subtitle={subtitle}
      breadcrumbs={[
        { label: 'Launcher', to: '/' },
        { label: 'App', to: appId ? buildAppHomePath(appId) : undefined },
        { label: entityLabel, to: baseEntityPath },
        { label: mode === 'edit' ? 'Edit' : 'New' },
      ]}
      actions={
        <Link
          to={recordId ? `${baseEntityPath}/${recordId}` : baseEntityPath}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Cancel
        </Link>
      }
    >
      {loading && <EntityStatePanel title="Caricamento form in corso..." />}
      {!loading && error && (
        <EntityStatePanel tone="error" title="Form non disponibile" description={error} />
      )}
      {!loading && !error && (
        <>
          {mode === 'create' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
                  Record Type
                </span>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={selectedRecordTypeDeveloperName}
                  onChange={(event) => setSelectedRecordTypeDeveloperName(event.target.value)}
                  disabled={createOptions.length <= 1}
                >
                  {createOptions.length > 1 ? <option value="">Select a record type</option> : null}
                  {createOptions.map((option) => (
                    <option key={option.recordTypeDeveloperName} value={option.recordTypeDeveloperName}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          {mode === 'create' && selectedRecordTypeDeveloperName.length === 0 ? (
            <EntityStatePanel
              title="Seleziona un record type"
              description={
                createOptions.length === 0
                  ? 'Nessun record type con form accessibile è disponibile per questa entity.'
                  : 'Scegli il record type per caricare il layout di creazione corretto.'
              }
            />
          ) : (
            <EntityRecordForm
              entityId={entityId}
              sections={sections}
              initialValues={initialValuesWithLookupPrefill}
              lookupContext={lookupContext}
              submitLabel={mode === 'edit' ? 'Save changes' : 'Create record'}
              isSubmitting={submitting}
              onSubmit={async (values) => {
                try {
                  setSubmitting(true)
                  const filteredValues = filterFormValues(values, sections)

                  const payload =
                    mode === 'edit' && recordId
                      ? await updateEntityRecord(entityId, recordId, filteredValues)
                      : await createEntityRecord(
                          entityId,
                          filteredValues,
                          selectedRecordTypeDeveloperName,
                        )

                  const targetRecordId =
                    (payload ? getRecordId(payload) : '') ||
                    (mode === 'edit' && recordId ? recordId : '')

                  if (targetRecordId) {
                    navigate(`${baseEntityPath}/${targetRecordId}`)
                    return
                  }

                  navigate(baseEntityPath)
                } catch (submitError) {
                  const message =
                    submitError instanceof Error ? submitError.message : 'Errore salvataggio record'
                  setError(message)
                } finally {
                  setSubmitting(false)
                }
              }}
            />
          )}
        </>
      )}
    </EntityPageFrame>
  )
}

function filterFormValues(values: EntityRecord, sections: RuntimeFormSectionConfig[]): EntityRecord {
  const payload: EntityRecord = {}

  for (const field of sections.flatMap((section) => section.fields)) {
    payload[field.field] = normalizeSubmittedFieldValue(values[field.field], field.inputType)
  }

  return payload
}

function applyFieldDefaults(
  values: EntityRecord,
  sections: RuntimeFormSectionConfig[],
): EntityRecord {
  const nextValues: EntityRecord = { ...values }

  for (const field of sections.flatMap((section) => section.fields)) {
    if (hasPrefilledValue(nextValues[field.field])) {
      continue
    }

    if (field.inputType === 'select') {
      const defaultOption = field.options?.find((option) => option.default)
      if (defaultOption) {
        nextValues[field.field] = defaultOption.value
      }
      continue
    }

    if (field.inputType === 'multiselect') {
      const defaultOptions =
        field.options?.filter((option) => option.default).map((option) => option.value) ?? []
      if (defaultOptions.length > 0) {
        nextValues[field.field] = defaultOptions
      }
    }
  }

  return nextValues
}

function applyLookupPrefill(
  values: EntityRecord,
  sections: RuntimeFormSectionConfig[],
  context: EntityRecord,
): EntityRecord {
  const nextValues: EntityRecord = { ...values }

  for (const field of sections.flatMap((section) => section.fields)) {
    if (!field.lookup?.prefill) {
      continue
    }

    const currentValue = nextValues[field.field]
    if (hasPrefilledValue(currentValue)) {
      continue
    }

    const conditions = resolveLookupConditions(field.lookup.where ?? [], context)
    const preferredIdCondition = conditions.find((condition) => condition.field === 'Id')
    const fallbackCondition = conditions.find((condition) => condition.value !== undefined)
    const selectedCondition = preferredIdCondition ?? fallbackCondition

    if (
      !selectedCondition ||
      selectedCondition.value === undefined ||
      (typeof selectedCondition.value === 'string' && selectedCondition.value.trim().length === 0)
    ) {
      continue
    }

    nextValues[field.field] = selectedCondition.value
  }

  return nextValues
}

function hasPrefilledValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  return true
}

function resolveLookupConditions(
  conditions: LookupCondition[],
  context: EntityRecord,
): LookupCondition[] {
  const resolved: LookupCondition[] = []
  const contextParentRel = String(context.parentRel ?? '').trim()

  for (const condition of conditions) {
    const conditionParentRel = condition.parentRel?.trim()
    if (conditionParentRel) {
      if (!contextParentRel || contextParentRel !== conditionParentRel) {
        continue
      }
    }

    if (condition.field?.trim().toLowerCase() === 'parentrel') {
      const expectedParentRel =
        typeof condition.value === 'string'
          ? renderRecordTemplate(condition.value, context).trim()
          : String(condition.value ?? '').trim()

      if (!expectedParentRel || !contextParentRel || expectedParentRel !== contextParentRel) {
        continue
      }

      continue
    }

    if (typeof condition.value === 'string') {
      const hasTemplate = /\{\{[^}]+\}\}/.test(condition.value)
      const rendered = renderRecordTemplate(condition.value, context).trim()

      if (hasTemplate && rendered.length === 0) {
        continue
      }

      resolved.push({
        ...condition,
        value: rendered,
      })
      continue
    }

    resolved.push({
      ...condition,
      value: condition.value,
    })
  }

  return resolved
}

function normalizeSubmittedFieldValue(
  value: unknown,
  inputType: RuntimeFormSectionConfig['fields'][number]['inputType'],
): unknown {
  if (inputType === 'checkbox') {
    return Boolean(value)
  }

  if (inputType === 'multiselect') {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean)
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.split(';').map((entry) => entry.trim()).filter(Boolean)
    }

    return []
  }

  if (inputType === 'number') {
    if (value === null || value === undefined) {
      return null
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null
    }

    if (typeof value === 'string') {
      const normalized = value.trim()
      if (normalized.length === 0) {
        return null
      }

      const parsed = Number(normalized)
      return Number.isFinite(parsed) ? parsed : normalized
    }
  }

  if (typeof value === 'string') {
    return value.trim().length === 0 ? null : value
  }

  if (value === undefined) {
    return null
  }

  return value
}
