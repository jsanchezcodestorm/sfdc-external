import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import {
  createEntityRecord,
  fetchEntityConfig,
  fetchEntityForm,
  updateEntityRecord,
} from '../entity-api'
import {
  getRecordId,
  normalizeEntityBasePath,
  renderRecordTemplate,
  toTitleCase,
} from '../entity-helpers'
import type {
  EntityConfigEnvelope,
  EntityRecord,
  EntityFormResponse,
  FormSectionConfig,
  LookupCondition,
} from '../entity-types'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityRecordForm } from '../components/EntityRecordForm'
import { EntityStatePanel } from '../components/EntityStatePanel'

export function EntityFormPage() {
  const navigate = useNavigate()
  const { entityId = '', recordId } = useParams()
  const [searchParams] = useSearchParams()
  const mode = recordId ? 'edit' : 'create'

  const [config, setConfig] = useState<EntityConfigEnvelope | null>(null)
  const [formResponse, setFormResponse] = useState<EntityFormResponse | null>(null)
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

      const payload = await fetchEntityForm(entityId, recordId)
      setFormResponse(payload)

      if (payload?.values) {
        setInitialValues(payload.values)
      } else if (payload?.record) {
        setInitialValues(payload.record)
      } else {
        setInitialValues({})
      }

      if (recordId && !payload?.values && !payload?.record) {
        throw new Error('Form edit payload non conforme: values/record mancanti')
      }

      setError(null)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Errore caricamento form'
      setError(message)
      setConfig(null)
      setFormResponse(null)
      setInitialValues({})
    } finally {
      setLoading(false)
    }
  }, [entityId, recordId])

  useEffect(() => {
    void loadForm()
  }, [loadForm])

  const entityLabel = config?.entity.label ?? toTitleCase(entityId)
  const baseEntityPath = normalizeEntityBasePath(entityId, config?.entity.navigation?.basePath)

  const sections = useMemo<FormSectionConfig[]>(() => {
    if (formResponse?.sections && formResponse.sections.length > 0) {
      return formResponse.sections
    }

    if (config?.entity.form?.sections && config.entity.form.sections.length > 0) {
      return config.entity.form.sections
    }

    return []
  }, [config?.entity.form?.sections, formResponse?.sections])

  const lookupContext = useMemo<EntityRecord>(() => {
    const context: EntityRecord = {
      entityId,
      id: recordId ?? '',
      recordId: recordId ?? '',
      parentId: searchParams.get('parentId') ?? '',
      parentRel: searchParams.get('parentRel') ?? '',
    }

    for (const [key, value] of searchParams.entries()) {
      context[key] = value
    }

    return context
  }, [entityId, recordId, searchParams])

  const initialValuesWithLookupPrefill = useMemo(() => {
    if (mode !== 'create') {
      return initialValues
    }

    return applyLookupPrefill(initialValues, sections, lookupContext)
  }, [initialValues, lookupContext, mode, sections])

  const title =
    formResponse?.title ??
    (mode === 'edit' ? config?.entity.form?.title?.edit : config?.entity.form?.title?.create) ??
    `${mode === 'edit' ? 'Edit' : 'New'} ${entityLabel}`

  const subtitle = formResponse?.subtitle ?? config?.entity.form?.subtitle ?? `${entityLabel} - ${mode}`

  if (!entityId) {
    return (
      <EntityPageFrame
        title="Form non valida"
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
      title={title}
      subtitle={subtitle}
      breadcrumbs={[
        { label: 'Home', to: '/' },
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
        <EntityRecordForm
          sections={sections}
          initialValues={initialValuesWithLookupPrefill}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Create record'}
          isSubmitting={submitting}
          onSubmit={async (values) => {
            try {
              setSubmitting(true)
              const filteredValues = filterFormValues(values, sections)

              const payload =
                mode === 'edit' && recordId
                  ? await updateEntityRecord(entityId, recordId, filteredValues)
                  : await createEntityRecord(entityId, filteredValues)

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
    </EntityPageFrame>
  )
}

function filterFormValues(values: EntityRecord, sections: FormSectionConfig[]): EntityRecord {
  const allowedFields = new Set(
    sections.flatMap((section) => section.fields.map((field) => field.field)),
  )

  const payload: EntityRecord = {}

  for (const [key, value] of Object.entries(values)) {
    if (!allowedFields.has(key)) {
      continue
    }

    payload[key] = value
  }

  return payload
}

function applyLookupPrefill(
  values: EntityRecord,
  sections: FormSectionConfig[],
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
