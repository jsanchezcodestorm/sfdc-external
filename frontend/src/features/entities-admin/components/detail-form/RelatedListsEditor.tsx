import { QueryOrderByJsonArrayEditor } from '../QueryOrderByJsonArrayEditor'
import { QueryWhereJsonArrayEditor } from '../QueryWhereJsonArrayEditor'
import { RowActionsJsonArrayEditor } from '../RowActionsJsonArrayEditor'
import { SalesforceColumnsBuilder } from '../SalesforceColumnsBuilder'
import { SalesforceFieldMultiSelect } from '../SalesforceFieldMultiSelect'
import { ObjectApiNameQuickFind } from './ObjectApiNameQuickFind'
import type { RelatedListDraft } from './detail-form.types'

type RelatedListsEditorProps = {
  value: RelatedListDraft[]
  onChange: (value: RelatedListDraft[]) => void
}

export function RelatedListsEditor({ value, onChange }: RelatedListsEditorProps) {
  const updateRelatedList = (index: number, patch: Partial<RelatedListDraft>) => {
    onChange(
      value.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    )
  }

  const addRelatedList = () => {
    onChange([...value, createEmptyRelatedListDraft(`related-${value.length + 1}`)])
  }

  const removeRelatedList = (index: number) => {
    onChange(value.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Related Lists
      </legend>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{value.length} related list configurate</p>
        <button
          type="button"
          onClick={addRelatedList}
          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
        >
          Aggiungi Related List
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {value.map((relatedList, index) => (
          <article
            key={`related-list-${index}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Related List {index + 1}
                </p>
                <h3 className="text-base font-semibold text-slate-900">
                  {relatedList.label || relatedList.id || `related-${index + 1}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => removeRelatedList(index)}
                className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
              >
                Rimuovi Related List
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Id
                <input
                  type="text"
                  value={relatedList.id}
                  onChange={(event) => updateRelatedList(index, { id: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Label
                <input
                  type="text"
                  value={relatedList.label}
                  onChange={(event) => updateRelatedList(index, { label: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Query Object API Name
                <ObjectApiNameQuickFind
                  value={relatedList.objectApiName}
                  onChange={(nextValue) => updateRelatedList(index, { objectApiName: nextValue })}
                  placeholder="es. Contact"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Entity Id
                <input
                  type="text"
                  value={relatedList.entityId}
                  onChange={(event) => updateRelatedList(index, { entityId: event.target.value })}
                  placeholder="opzionale"
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Page Size
                <input
                  type="number"
                  min={1}
                  value={relatedList.pageSize}
                  onChange={(event) => updateRelatedList(index, { pageSize: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Query Limit
                <input
                  type="number"
                  min={1}
                  value={relatedList.queryLimit}
                  onChange={(event) => updateRelatedList(index, { queryLimit: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                Description
                <input
                  type="text"
                  value={relatedList.description}
                  onChange={(event) =>
                    updateRelatedList(index, { description: event.target.value })
                  }
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                Empty State
                <input
                  type="text"
                  value={relatedList.emptyState}
                  onChange={(event) =>
                    updateRelatedList(index, { emptyState: event.target.value })
                  }
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </div>

            <div className="mt-4">
              <SalesforceFieldMultiSelect
                label="Query Fields"
                objectApiName={relatedList.objectApiName}
                value={relatedList.queryFields}
                helperText="Campi caricati dalla query della related list."
                onChange={(nextValue) => updateRelatedList(index, { queryFields: nextValue })}
              />
            </div>

            <div className="mt-4">
              <SalesforceColumnsBuilder
                label="Columns"
                objectApiName={relatedList.objectApiName}
                queryFields={relatedList.queryFields}
                value={relatedList.columns}
                helperText="Disponibili solo i campi presenti in Query Fields."
                onChange={(nextValue) => updateRelatedList(index, { columns: nextValue })}
              />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <QueryWhereJsonArrayEditor
                value={relatedList.queryWhereJson}
                availableFields={relatedList.queryFields}
                onChange={(nextValue) => updateRelatedList(index, { queryWhereJson: nextValue })}
              />

              <QueryOrderByJsonArrayEditor
                value={relatedList.queryOrderByJson}
                availableFields={relatedList.queryFields}
                onChange={(nextValue) =>
                  updateRelatedList(index, { queryOrderByJson: nextValue })
                }
              />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <RowActionsJsonArrayEditor
                value={relatedList.actionsJson}
                legend="Actions"
                description="Azioni disponibili nella testata della related list."
                addLabel="Aggiungi Action"
                emptyMessage="Nessuna action configurata."
                onChange={(nextValue) => updateRelatedList(index, { actionsJson: nextValue })}
              />

              <RowActionsJsonArrayEditor
                value={relatedList.rowActionsJson}
                onChange={(nextValue) => updateRelatedList(index, { rowActionsJson: nextValue })}
              />
            </div>
          </article>
        ))}

        {value.length === 0 ? (
          <p className="text-sm text-slate-400">Nessuna related list configurata.</p>
        ) : null}
      </div>
    </fieldset>
  )
}

function createEmptyRelatedListDraft(id = ''): RelatedListDraft {
  return {
    id,
    label: '',
    description: '',
    entityId: '',
    objectApiName: '',
    queryFields: [],
    queryWhereJson: '',
    queryOrderByJson: '',
    queryLimit: '',
    columns: '',
    actionsJson: '',
    rowActionsJson: '',
    emptyState: '',
    pageSize: '',
  }
}
