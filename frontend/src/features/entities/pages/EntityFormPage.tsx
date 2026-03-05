import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  createEntityRecord,
  fetchEntityConfig,
  fetchEntityForm,
  updateEntityRecord,
} from '../entity-api'
import {
  getRecordId,
  toTitleCase,
} from '../entity-helpers'
import type {
  EntityConfigEnvelope,
  EntityRecord,
  EntityFormResponse,
  FormSectionConfig,
} from '../entity-types'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityRecordForm } from '../components/EntityRecordForm'
import { EntityStatePanel } from '../components/EntityStatePanel'

export function EntityFormPage() {
  const navigate = useNavigate()
  const { entityId = '', recordId } = useParams()
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

  const sections = useMemo<FormSectionConfig[]>(() => {
    if (formResponse?.sections && formResponse.sections.length > 0) {
      return formResponse.sections
    }

    if (config?.entity.form?.sections && config.entity.form.sections.length > 0) {
      return config.entity.form.sections
    }

    return []
  }, [config?.entity.form?.sections, formResponse?.sections])

  const title =
    formResponse?.title ??
    (mode === 'edit' ? config?.entity.form?.title?.edit : config?.entity.form?.title?.create) ??
    `${mode === 'edit' ? 'Edit' : 'New'} ${entityLabel}`

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
      subtitle={`${entityLabel} - ${mode}`}
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: entityLabel, to: `/s/${entityId}` },
        { label: mode === 'edit' ? 'Edit' : 'New' },
      ]}
      actions={
        <Link
          to={recordId ? `/s/${entityId}/${recordId}` : `/s/${entityId}`}
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
          initialValues={initialValues}
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
                navigate(`/s/${entityId}/${targetRecordId}`)
                return
              }

              navigate(`/s/${entityId}`)
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
