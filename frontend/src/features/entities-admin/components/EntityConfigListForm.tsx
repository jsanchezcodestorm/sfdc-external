import { useState } from 'react'

import type {
  ListActionDraft,
  ListFormDraft,
  ListViewDraft,
} from '../list-form/list-form.types'
import { QueryOrderByJsonArrayEditor } from './QueryOrderByJsonArrayEditor'
import { QueryWhereJsonArrayEditor } from './QueryWhereJsonArrayEditor'
import { RowActionsJsonArrayEditor } from './RowActionsJsonArrayEditor'
import { SalesforceColumnsBuilder } from './SalesforceColumnsBuilder'
import { SalesforceFieldMultiSelect } from './SalesforceFieldMultiSelect'

type ListFormField = 'title' | 'subtitle'
type ListActionField = keyof ListActionDraft
type ListViewTextField = Exclude<
  keyof ListViewDraft,
  'default' | 'primaryAction' | 'queryFields' | 'searchFields'
>
type ListViewSelectionField = 'queryFields' | 'searchFields'

type EntityConfigListFormProps = {
  value: ListFormDraft
  error: string | null
  baseObjectApiName: string
  selectedViewIndex: number
  onChangeField: (field: ListFormField, value: string) => void
  onChangePrimaryAction: (field: ListActionField, value: string) => void
  onSelectView: (index: number) => void
  onAddView: () => void
  onRemoveView: (index: number) => void
  onChangeViewField: (index: number, field: ListViewTextField, value: string) => void
  onChangeViewSelectionField: (
    index: number,
    field: ListViewSelectionField,
    value: string[],
  ) => void
  onChangeViewPrimaryAction: (
    index: number,
    field: ListActionField,
    value: string,
  ) => void
  onToggleViewDefault: (index: number, checked: boolean) => void
  onApply: () => void
}

export function EntityConfigListForm({
  value,
  error,
  baseObjectApiName,
  selectedViewIndex,
  onChangeField,
  onChangePrimaryAction,
  onSelectView,
  onAddView,
  onRemoveView,
  onChangeViewField,
  onChangeViewSelectionField,
  onChangeViewPrimaryAction,
  onToggleViewDefault,
  onApply,
}: EntityConfigListFormProps) {
  const [editingViewIndex, setEditingViewIndex] = useState<number | null>(null)
  const resolvedEditingViewIndex =
    editingViewIndex !== null && value.views[editingViewIndex] ? editingViewIndex : null
  const editingView =
    resolvedEditingViewIndex !== null ? value.views[resolvedEditingViewIndex] : null
  const canRemoveView = value.views.length > 1

  const openViewModal = (index: number) => {
    onSelectView(index)
    setEditingViewIndex(index)
  }

  const closeViewModal = () => {
    setEditingViewIndex(null)
  }

  const handleRemoveView = (index: number) => {
    if (!canRemoveView) {
      return
    }

    onRemoveView(index)

    setEditingViewIndex((current) => {
      if (current === null) {
        return current
      }

      if (current === index) {
        return null
      }

      return current > index ? current - 1 : current
    })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Form
          </p>
          <h2 className="text-lg font-semibold text-slate-900">Sezione LIST</h2>
        </div>
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Applica Modifiche List
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          List Title
          <input
            type="text"
            value={value.title}
            onChange={(event) => onChangeField('title', event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          List Subtitle
          <input
            type="text"
            value={value.subtitle}
            onChange={(event) => onChangeField('subtitle', event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
      </div>

      <ActionDraftFields
        title="Primary Action (List)"
        value={value.primaryAction}
        className="mt-4"
        onChange={(field, nextValue) => onChangePrimaryAction(field, nextValue)}
      />

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Views
            </p>
            <p className="text-sm text-slate-600">
              {value.views.length} view configurate
            </p>
          </div>

          <button
            type="button"
            onClick={onAddView}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          >
            Aggiungi View
          </button>
        </div>

        {value.views.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Default</th>
                  <th className="px-3 py-2 text-left">View Id</th>
                  <th className="px-3 py-2 text-left">Label</th>
                  <th className="px-3 py-2 text-left">Query Fields</th>
                  <th className="px-3 py-2 text-left">Columns</th>
                  <th className="px-3 py-2 text-left">Search Fields</th>
                  <th className="px-3 py-2 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {value.views.map((view, index) => (
                  <tr
                    key={`${view.id}-${index}`}
                    className={index === selectedViewIndex ? 'bg-sky-50/40' : 'bg-white'}
                  >
                    <td className="px-3 py-2 text-slate-700">{view.default ? 'Si' : '-'}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {view.id || `view-${index + 1}`}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{view.label || '-'}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {countNonEmptyValues(view.queryFields)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{countRows(view.columns)}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {countNonEmptyValues(view.searchFields)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openViewModal(index)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveView(index)}
                          disabled={!canRemoveView}
                          className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
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
          <p className="mt-4 text-sm text-slate-600">Nessuna view configurata.</p>
        )}
      </div>

      {editingView !== null && resolvedEditingViewIndex !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={closeViewModal}
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
                  View Editor
                </p>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingView.label || editingView.id || `View ${resolvedEditingViewIndex + 1}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeViewModal}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              >
                Chiudi
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto px-5 py-4">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    View Id
                    <input
                      type="text"
                      value={editingView.id}
                      onChange={(event) =>
                        onChangeViewField(resolvedEditingViewIndex, 'id', event.target.value)
                      }
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    View Label
                    <input
                      type="text"
                      value={editingView.label}
                      onChange={(event) =>
                        onChangeViewField(resolvedEditingViewIndex, 'label', event.target.value)
                      }
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700 md:col-span-2">
                    Description
                    <input
                      type="text"
                      value={editingView.description}
                      onChange={(event) =>
                        onChangeViewField(
                          resolvedEditingViewIndex,
                          'description',
                          event.target.value,
                        )
                      }
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Page Size
                    <input
                      type="number"
                      min={1}
                      value={editingView.pageSize}
                      onChange={(event) =>
                        onChangeViewField(
                          resolvedEditingViewIndex,
                          'pageSize',
                          event.target.value,
                        )
                      }
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={editingView.default}
                        onChange={(event) =>
                          onToggleViewDefault(
                            resolvedEditingViewIndex,
                            event.target.checked,
                          )
                        }
                        className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
                      />
                      Default View
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                  <div className="space-y-4">
                    <label className="text-sm font-medium text-slate-700">
                      Query Object API Name
                      <input
                        type="text"
                        value={baseObjectApiName}
                        readOnly
                        className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
                        value={editingView.queryLimit}
                        onChange={(event) =>
                          onChangeViewField(
                            resolvedEditingViewIndex,
                            'queryLimit',
                            event.target.value,
                          )
                        }
                        className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                      Search Min Length
                      <input
                        type="number"
                        min={1}
                        value={editingView.searchMinLength}
                        onChange={(event) =>
                          onChangeViewField(
                            resolvedEditingViewIndex,
                            'searchMinLength',
                            event.target.value,
                          )
                        }
                        className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      />
                    </label>
                  </div>

                  <div className="space-y-4">
                    <SalesforceFieldMultiSelect
                      label="Query Fields"
                      objectApiName={baseObjectApiName}
                      value={editingView.queryFields}
                      helperText="Selezione multipla campi inclusi nella query list."
                      onChange={(nextValue) =>
                        onChangeViewSelectionField(
                          resolvedEditingViewIndex,
                          'queryFields',
                          nextValue,
                        )
                      }
                    />

                    <SalesforceFieldMultiSelect
                      label="Search Fields"
                      objectApiName={baseObjectApiName}
                      value={editingView.searchFields}
                      helperText="Campi usati dal search della view."
                      onChange={(nextValue) =>
                        onChangeViewSelectionField(
                          resolvedEditingViewIndex,
                          'searchFields',
                          nextValue,
                        )
                      }
                    />
                  </div>
                </div>

                <SalesforceColumnsBuilder
                  label="Columns"
                  objectApiName={baseObjectApiName}
                  queryFields={editingView.queryFields}
                  value={editingView.columns}
                  helperText="Disponibili solo i campi presenti in Query Fields. Serializzazione: `field` oppure `field|label` (one per line)."
                  onChange={(nextValue) =>
                    onChangeViewField(resolvedEditingViewIndex, 'columns', nextValue)
                  }
                />

                <QueryWhereJsonArrayEditor
                  value={editingView.queryWhereJson}
                  availableFields={editingView.queryFields}
                  onChange={(nextValue) =>
                    onChangeViewField(
                      resolvedEditingViewIndex,
                      'queryWhereJson',
                      nextValue,
                    )
                  }
                />

                <QueryOrderByJsonArrayEditor
                  value={editingView.queryOrderByJson}
                  availableFields={editingView.queryFields}
                  onChange={(nextValue) =>
                    onChangeViewField(
                      resolvedEditingViewIndex,
                      'queryOrderByJson',
                      nextValue,
                    )
                  }
                />

                <ActionDraftFields
                  title="Primary Action (View)"
                  value={editingView.primaryAction}
                  onChange={(field, nextValue) =>
                    onChangeViewPrimaryAction(
                      resolvedEditingViewIndex,
                      field,
                      nextValue,
                    )
                  }
                />

                <RowActionsJsonArrayEditor
                  value={editingView.rowActionsJson}
                  onChange={(nextValue) =>
                    onChangeViewField(
                      resolvedEditingViewIndex,
                      'rowActionsJson',
                      nextValue,
                    )
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => handleRemoveView(resolvedEditingViewIndex)}
                disabled={!canRemoveView}
                className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Rimuovi View
              </button>
              <button
                type="button"
                onClick={closeViewModal}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-slate-700"
              >
                Fatto
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function countNonEmptyValues(values: string[]): number {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0).length
}

function countRows(value: string): number {
  return value
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0).length
}

type ActionDraftFieldsProps = {
  title: string
  value: ListActionDraft
  className?: string
  onChange: (field: keyof ListActionDraft, value: string) => void
}

function ActionDraftFields({
  title,
  value,
  className,
  onChange,
}: ActionDraftFieldsProps) {
  return (
    <fieldset className={className}>
      <legend className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </legend>
      <div className="mt-2 grid gap-4 md:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Type
          <select
            value={value.type}
            onChange={(event) => onChange('type', event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            <option value="">None</option>
            <option value="link">link</option>
            <option value="edit">edit</option>
            <option value="delete">delete</option>
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Label
          <input
            type="text"
            value={value.label}
            onChange={(event) => onChange('label', event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Target
          <input
            type="text"
            value={value.target}
            onChange={(event) => onChange('target', event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Entity Id
          <input
            type="text"
            value={value.entityId}
            onChange={(event) => onChange('entityId', event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
      </div>
    </fieldset>
  )
}
