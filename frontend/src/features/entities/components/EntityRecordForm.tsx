import { useEffect, useMemo, useState } from 'react'

import type { EntityRecord, FormFieldConfig, FormSectionConfig } from '../entity-types'

type EntityRecordFormProps = {
  sections: FormSectionConfig[]
  initialValues: EntityRecord
  submitLabel: string
  isSubmitting: boolean
  onSubmit: (values: EntityRecord) => Promise<void>
}

export function EntityRecordForm({
  sections,
  initialValues,
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
                field={field}
                value={toInputValue(values[field.field])}
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
  field: FormFieldConfig
  value: string
  onChange: (value: string) => void
}

function FormInput({ field, value, onChange }: FormInputProps) {
  const inputClassName =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100'
  const placeholder = field.placeholder ?? (field.lookup ? `Lookup by ${field.lookup.searchField ?? 'Name'}` : undefined)

  return (
    <label className={field.inputType === 'textarea' ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
        {field.label}
        {field.required ? ' *' : ''}
        {field.lookup ? ' (Lookup)' : ''}
      </span>
      {field.inputType === 'textarea' ? (
        <textarea
          className={`${inputClassName} min-h-24`}
          value={value}
          placeholder={placeholder}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={inputClassName}
          type={field.inputType ?? 'text'}
          value={value}
          placeholder={placeholder}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        />
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

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
