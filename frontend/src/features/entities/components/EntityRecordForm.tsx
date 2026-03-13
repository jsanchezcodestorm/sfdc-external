import { useEffect, useMemo, useState } from 'react'

import { searchEntityFormLookup } from '../entity-api'
import { resolveDisplayFieldValue } from '../entity-helpers'
import type {
  EntityRecord,
  RuntimeFormFieldConfig,
  RuntimeFormSectionConfig,
} from '../entity-types'

type EntityRecordFormProps = {
  entityId: string
  sections: RuntimeFormSectionConfig[]
  initialValues: EntityRecord
  lookupContext: EntityRecord
  submitLabel: string
  isSubmitting: boolean
  onSubmit: (values: EntityRecord) => Promise<void>
}

export function EntityRecordForm({
  entityId,
  sections,
  initialValues,
  lookupContext,
  submitLabel,
  isSubmitting,
  onSubmit,
}: EntityRecordFormProps) {
  const [values, setValues] = useState<EntityRecord>(initialValues)

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  const fields = useMemo(() => sections.flatMap((section) => section.fields), [sections])

  if (fields.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-sm text-slate-500">
        Configurazione form non disponibile per questa entita.
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(values)
      }}
    >
      {sections.map((section) => (
        <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">{section.title}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <FormInput
                key={field.field}
                entityId={entityId}
                field={field}
                values={values}
                lookupContext={lookupContext}
                onChange={(nextValue) => {
                  setValues((current) => ({
                    ...current,
                    [field.field]: nextValue,
                  }))
                }}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSubmitting ? 'Salvataggio...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

type FormInputProps = {
  entityId: string
  field: RuntimeFormFieldConfig
  values: EntityRecord
  lookupContext: EntityRecord
  onChange: (value: unknown) => void
}

function FormInput({ entityId, field, values, lookupContext, onChange }: FormInputProps) {
  const inputClassName =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
  const placeholder =
    field.placeholder ?? (field.lookup ? `Lookup by ${field.lookup.searchField}` : undefined)
  const rawValue = values[field.field]

  if (field.inputType === 'checkbox') {
    return (
      <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
        <input
          type="checkbox"
          checked={Boolean(rawValue)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
        />
        <span className="text-sm font-medium text-slate-700">
          {field.label}
          {field.required ? ' *' : ''}
        </span>
      </label>
    )
  }

  if (field.inputType === 'select') {
    return (
      <label>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
          {field.label}
          {field.required ? ' *' : ''}
        </span>
        <select
          className={inputClassName}
          value={typeof rawValue === 'string' ? rawValue : ''}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{placeholder ?? 'Select an option'}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.inputType === 'multiselect') {
    const selectedValues = Array.isArray(rawValue)
      ? rawValue.map((entry) => String(entry))
      : typeof rawValue === 'string' && rawValue.trim().length > 0
        ? rawValue.split(';').map((entry) => entry.trim()).filter(Boolean)
        : []

    return (
      <label className="sm:col-span-2">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
          {field.label}
          {field.required ? ' *' : ''}
        </span>
        <select
          multiple
          className={`${inputClassName} min-h-32`}
          value={selectedValues}
          required={field.required}
          onChange={(event) =>
            onChange(Array.from(event.target.selectedOptions).map((option) => option.value))
          }
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.inputType === 'lookup' && field.lookup) {
    return (
      <LookupInput
        entityId={entityId}
        field={field}
        value={rawValue}
        values={values}
        lookupContext={lookupContext}
        onChange={onChange}
      />
    )
  }

  const normalizedValue = toInputValue(rawValue)

  return (
    <label className={field.inputType === 'textarea' ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      {field.inputType === 'textarea' ? (
        <textarea
          className={`${inputClassName} min-h-24`}
          value={normalizedValue}
          placeholder={placeholder}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={inputClassName}
          type={field.inputType === 'number' ? 'number' : field.inputType}
          value={normalizedValue}
          placeholder={placeholder}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  )
}

type LookupInputProps = {
  entityId: string
  field: RuntimeFormFieldConfig
  value: unknown
  values: EntityRecord
  lookupContext: EntityRecord
  onChange: (value: unknown) => void
}

function LookupInput({
  entityId,
  field,
  value,
  values,
  lookupContext,
  onChange,
}: LookupInputProps) {
  const [searchInput, setSearchInput] = useState('')
  const [suggestions, setSuggestions] = useState<
    Array<{ id: string; label: string; objectApiName: string; subtitle?: string }>
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayValue = useMemo(() => {
    if (typeof value === 'string' && value.trim().length === 0) {
      return ''
    }

    const relatedLabel = resolveDisplayFieldValue(values, field.field)
    if (typeof relatedLabel === 'string' && relatedLabel.trim().length > 0) {
      return relatedLabel
    }

    if (typeof value === 'string') {
      return value
    }

    return ''
  }, [field.field, value, values])

  useEffect(() => {
    setSearchInput(displayValue)
  }, [displayValue])

  const searchValue = searchInput.trim()

  useEffect(() => {
    if (searchValue.length < 2) {
      setSuggestions([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        setLoading(true)
        const context = buildLookupContext(lookupContext, values)
        const payload = await searchEntityFormLookup(entityId, field.field, {
          q: searchValue,
          context,
          recordId: typeof context.recordId === 'string' ? context.recordId : undefined,
          recordTypeDeveloperName:
            typeof context.recordTypeDeveloperName === 'string'
              ? context.recordTypeDeveloperName
              : undefined,
        })

        if (cancelled) {
          return
        }

        setSuggestions(payload.items)
        setError(null)
      } catch (lookupError) {
        if (cancelled) {
          return
        }

        const message =
          lookupError instanceof Error ? lookupError.message : 'Errore lookup'
        setSuggestions([])
        setError(message)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [entityId, field.field, lookupContext, searchValue, values])

  return (
    <label className="relative">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      <input
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        type="text"
        value={searchInput}
        placeholder={field.placeholder ?? `Lookup by ${field.lookup?.searchField ?? 'Name'}`}
        required={field.required}
        onChange={(event) => {
          const nextValue = event.target.value
          setSearchInput(nextValue)
          onChange('')
        }}
      />

      {(loading || error || suggestions.length > 0) && (
        <div className="absolute z-10 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
            {loading ? 'Ricerca in corso...' : `${suggestions.length} risultati`}
          </div>

          {!loading && error ? (
            <p className="px-3 py-2 text-sm text-rose-600">{error}</p>
          ) : null}

          {!loading && !error && suggestions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Nessun risultato.</p>
          ) : null}

          {!loading && !error && suggestions.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto py-1">
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.objectApiName}:${suggestion.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput(suggestion.label)
                      setSuggestions([])
                      onChange(suggestion.id)
                    }}
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {suggestion.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {suggestion.subtitle ?? suggestion.id}
                      </span>
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {suggestion.objectApiName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </label>
  )
}

function toInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return ''
}

function buildLookupContext(...sources: EntityRecord[]): Record<string, string | number | boolean | null | undefined> {
  const context: Record<string, string | number | boolean | null | undefined> = {}

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value === null || value === undefined) {
        context[key] = value
        continue
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        context[key] = value
      }
    }
  }

  return context
}
