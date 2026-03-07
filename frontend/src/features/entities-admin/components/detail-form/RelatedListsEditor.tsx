import { useState } from 'react'

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
  const [editingRelatedListIndex, setEditingRelatedListIndex] = useState<number | null>(null)
  const resolvedEditingRelatedListIndex =
    editingRelatedListIndex !== null && value[editingRelatedListIndex]
      ? editingRelatedListIndex
      : null
  const editingRelatedList =
    resolvedEditingRelatedListIndex !== null ? value[resolvedEditingRelatedListIndex] : null

  const updateRelatedList = (index: number, patch: Partial<RelatedListDraft>) => {
    onChange(
      value.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    )
  }

  const addRelatedList = () => {
    const nextRelatedListIndex = value.length
    onChange([...value, createEmptyRelatedListDraft(`related-${value.length + 1}`)])
    setEditingRelatedListIndex(nextRelatedListIndex)
  }

  const removeRelatedList = (index: number) => {
    onChange(value.filter((_, currentIndex) => currentIndex !== index))
    setEditingRelatedListIndex((current) => {
      if (current === null) {
        return current
      }

      if (current === index) {
        return null
      }

      return current > index ? current - 1 : current
    })
  }

  const openRelatedListModal = (index: number) => {
    setEditingRelatedListIndex(index)
  }

  const closeRelatedListModal = () => {
    setEditingRelatedListIndex(null)
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

      {value.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Id</th>
                <th className="px-3 py-2 text-left">Label</th>
                <th className="px-3 py-2 text-left">Object API Name</th>
                <th className="px-3 py-2 text-left">Entity Id</th>
                <th className="px-3 py-2 text-left">Query Fields</th>
                <th className="px-3 py-2 text-left">Columns</th>
                <th className="px-3 py-2 text-left">Actions</th>
                <th className="px-3 py-2 text-left">Row Actions</th>
                <th className="px-3 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {value.map((relatedList, index) => (
                <tr
                  key={`${relatedList.id}-${index}`}
                  className={
                    index === resolvedEditingRelatedListIndex ? 'bg-sky-50/40' : 'bg-white'
                  }
                >
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {relatedList.id || `related-${index + 1}`}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{relatedList.label || '-'}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {relatedList.objectApiName || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{relatedList.entityId || '-'}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {countNonEmptyValues(relatedList.queryFields)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {countRows(relatedList.columns)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {countJsonArrayEntries(relatedList.actionsJson)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {countJsonArrayEntries(relatedList.rowActionsJson)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openRelatedListModal(index)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRelatedList(index)}
                        className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
                      >
                        Rimuovi
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400">Nessuna related list configurata.</p>
      )}

      {editingRelatedList !== null && resolvedEditingRelatedListIndex !== null ? (
        <RelatedListEditorModal
          index={resolvedEditingRelatedListIndex}
          value={editingRelatedList}
          onChange={updateRelatedList}
          onClose={closeRelatedListModal}
          onRemove={removeRelatedList}
        />
      ) : null}
    </fieldset>
  )
}

type RelatedListEditorModalProps = {
  index: number
  value: RelatedListDraft
  onChange: (index: number, patch: Partial<RelatedListDraft>) => void
  onClose: () => void
  onRemove: (index: number) => void
}

function RelatedListEditorModal({
  index,
  value,
  onChange,
  onClose,
  onRemove,
}: RelatedListEditorModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Related List Editor
            </p>
            <h3 className="text-lg font-semibold text-slate-900">
              {value.label || value.id || `Related List ${index + 1}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Id
                <input
                  type="text"
                  value={value.id}
                  onChange={(event) => onChange(index, { id: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Label
                <input
                  type="text"
                  value={value.label}
                  onChange={(event) => onChange(index, { label: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Query Object API Name
                <ObjectApiNameQuickFind
                  value={value.objectApiName}
                  onChange={(nextValue) => onChange(index, { objectApiName: nextValue })}
                  placeholder="es. Contact"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Entity Id
                <input
                  type="text"
                  value={value.entityId}
                  onChange={(event) => onChange(index, { entityId: event.target.value })}
                  placeholder="opzionale"
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Page Size
                <input
                  type="number"
                  min={1}
                  value={value.pageSize}
                  onChange={(event) => onChange(index, { pageSize: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Query Limit
                <input
                  type="number"
                  min={1}
                  value={value.queryLimit}
                  onChange={(event) => onChange(index, { queryLimit: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                Description
                <input
                  type="text"
                  value={value.description}
                  onChange={(event) => onChange(index, { description: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                Empty State
                <input
                  type="text"
                  value={value.emptyState}
                  onChange={(event) => onChange(index, { emptyState: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </div>

            <div>
              <SalesforceFieldMultiSelect
                label="Query Fields"
                objectApiName={value.objectApiName}
                value={value.queryFields}
                helperText="Campi caricati dalla query della related list."
                onChange={(nextValue) => onChange(index, { queryFields: nextValue })}
              />
            </div>

            <div>
              <SalesforceColumnsBuilder
                label="Columns"
                objectApiName={value.objectApiName}
                queryFields={value.queryFields}
                value={value.columns}
                helperText="Disponibili solo i campi presenti in Query Fields."
                onChange={(nextValue) => onChange(index, { columns: nextValue })}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <QueryWhereJsonArrayEditor
                value={value.queryWhereJson}
                objectApiName={value.objectApiName}
                availableFields={value.queryFields}
                onChange={(nextValue) => onChange(index, { queryWhereJson: nextValue })}
              />

              <QueryOrderByJsonArrayEditor
                value={value.queryOrderByJson}
                availableFields={value.queryFields}
                onChange={(nextValue) => onChange(index, { queryOrderByJson: nextValue })}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <RowActionsJsonArrayEditor
                value={value.actionsJson}
                legend="Actions"
                description="Azioni disponibili nella testata della related list."
                addLabel="Aggiungi Action"
                emptyMessage="Nessuna action configurata."
                onChange={(nextValue) => onChange(index, { actionsJson: nextValue })}
              />

              <RowActionsJsonArrayEditor
                value={value.rowActionsJson}
                onChange={(nextValue) => onChange(index, { rowActionsJson: nextValue })}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
          >
            Rimuovi Related List
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-slate-700"
          >
            Fatto
          </button>
        </div>
      </div>
    </div>
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

function countNonEmptyValues(values: string[]): number {
  return values
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0).length
}

function countRows(value: string): number {
  return value
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0).length
}

function countJsonArrayEntries(value: string): number {
  const trimmedValue = value.trim()
  if (trimmedValue.length === 0) {
    return 0
  }

  try {
    const parsedValue = JSON.parse(trimmedValue)
    return Array.isArray(parsedValue) ? parsedValue.length : 0
  } catch {
    return 0
  }
}
