import { useMemo, useState, type ReactNode } from 'react'

import { buildFormPreviewModel } from '../entities-admin-preview'
import type { EntityConfigFormEditorAreaKey } from '../entity-admin-routing'
import { EntityConfigEditorAccordion } from './EntityConfigEditorAccordion'
import { EntityConfigPreviewModal } from './EntityConfigPreviewModal'
import { QueryOrderByJsonArrayEditor } from './QueryOrderByJsonArrayEditor'
import { QueryWhereJsonArrayEditor } from './QueryWhereJsonArrayEditor'
import { SalesforceFieldMultiSelect } from './SalesforceFieldMultiSelect'
import { FormSectionsEditor } from './form-form/FormSectionsEditor'
import type { FormFormDraft } from './form-form/form-form.types'

type EntityConfigFormFormProps = {
  value: FormFormDraft
  error: string | null
  baseObjectApiName: string
  activeArea: EntityConfigFormEditorAreaKey
  onChange: (value: FormFormDraft) => void
  onAreaChange: (value: EntityConfigFormEditorAreaKey) => void
}

export function EntityConfigFormForm({
  value,
  error,
  baseObjectApiName,
  activeArea,
  onChange,
  onAreaChange,
}: EntityConfigFormFormProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const preview = useMemo(() => buildFormPreviewModel(value), [value])

  const updateField = (
    field: keyof FormFormDraft,
    nextValue: FormFormDraft[keyof FormFormDraft],
  ) => {
    onChange({
      ...value,
      [field]: nextValue,
    })
  }

  const items = [
    {
      id: 'header-query',
      label: 'Header & Query',
      title: 'Header del form e query principale',
      description: 'Definisce metadati del form e query iniziale di bootstrap.',
      content: (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Form
                </p>
                <h2 className="text-lg font-semibold text-slate-900">Sezione FORM</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Preview read-only del form finale con i campi attualmente selezionati.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              >
                Apri preview
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Query Object API Name <span className="text-rose-600">*</span>
                <input
                  type="text"
                  value={baseObjectApiName}
                  readOnly
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Valore ereditato dalla sezione Base.
                </p>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Query Limit
                <input
                  type="number"
                  min={1}
                  value={value.queryLimit}
                  onChange={(event) => updateField('queryLimit', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Create Title <span className="text-rose-600">*</span>
                <input
                  type="text"
                  value={value.createTitle}
                  onChange={(event) => updateField('createTitle', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Edit Title <span className="text-rose-600">*</span>
                <input
                  type="text"
                  value={value.editTitle}
                  onChange={(event) => updateField('editTitle', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                Subtitle
                <input
                  type="text"
                  value={value.subtitle}
                  onChange={(event) => updateField('subtitle', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </div>

            <div className="mt-5">
              <SalesforceFieldMultiSelect
                label="Query Fields *"
                objectApiName={baseObjectApiName}
                value={value.queryFields}
                helperText="Campi caricati dalla query del form e disponibili per la compilazione iniziale."
                onChange={(nextValue) => updateField('queryFields', nextValue)}
              />
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <QueryWhereJsonArrayEditor
                value={value.queryWhereJson}
                objectApiName={baseObjectApiName}
                availableFields={value.queryFields}
                onChange={(nextValue) => updateField('queryWhereJson', nextValue)}
              />

              <QueryOrderByJsonArrayEditor
                value={value.queryOrderByJson}
                availableFields={value.queryFields}
                onChange={(nextValue) => updateField('queryOrderByJson', nextValue)}
              />
            </div>
          </section>
        </div>
      ),
    },
    {
      id: 'sections',
      label: 'Sections',
      title: 'Struttura del form',
      description: 'Organizza le sezioni del form e i relativi field configurabili.',
      content: (
        <FormSectionsEditor
          objectApiName={baseObjectApiName}
          sections={value.sections}
          onChange={(nextSections) => updateField('sections', nextSections)}
        />
      ),
    },
  ] satisfies Array<{
    id: EntityConfigFormEditorAreaKey
    label: string
    title: string
    description: string
    content: ReactNode
  }>

  return (
    <>
      <EntityConfigEditorAccordion
        items={items}
        activeItemId={activeArea}
        navigationLabel="Navigazione aree form"
        onItemSelect={(itemId) => onAreaChange(itemId as EntityConfigFormEditorAreaKey)}
      />

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm text-rose-700">{error}</p>
        </section>
      ) : null}

      <EntityConfigPreviewModal
        open={isPreviewOpen}
        mode="form"
        preview={preview}
        onClose={() => setIsPreviewOpen(false)}
      />
    </>
  )
}
