import {
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState } from 'react'

import { describeFormSectionPreviewFields } from '../../entities-admin-preview'
import { QueryOrderByJsonArrayEditor } from '../QueryOrderByJsonArrayEditor'
import { QueryWhereJsonArrayEditor } from '../QueryWhereJsonArrayEditor'
import { SalesforceFieldSingleInput } from '../SalesforceFieldSingleInput'
import {
  createEmptyFormFieldDraft,
  createEmptyFormSectionDraft,
} from './form-form.mapper'
import type { FormFieldDraft, FormSectionDraft } from './form-form.types'

type FormSectionsEditorProps = {
  objectApiName: string
  sections: FormSectionDraft[]
  onChange: (value: FormSectionDraft[]) => void
}

const INPUT_TYPE_OPTIONS: Array<FormFieldDraft['inputType']> = [
  'text',
  'email',
  'tel',
  'date',
  'textarea',
]

export function FormSectionsEditor({
  objectApiName,
  sections,
  onChange,
}: FormSectionsEditorProps) {
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const resolvedSelectedSectionIndex =
    sections.length === 0 ? 0 : Math.min(selectedSectionIndex, sections.length - 1)
  const selectedSection = sections[resolvedSelectedSectionIndex] ?? null

  const sectionIds = useMemo(
    () => sections.map((_, index) => createSectionItemId(index)),
    [sections],
  )

  const fieldIds = useMemo(
    () =>
      selectedSection?.fields.map((_, index) => createFieldItemId(index)) ?? [],
    [selectedSection],
  )

  const addSection = () => {
    const nextSectionIndex = sections.length
    onChange([...sections, createEmptyFormSectionDraft()])
    setSelectedSectionIndex(nextSectionIndex)
  }

  const updateSection = (sectionIndex: number, patch: Partial<FormSectionDraft>) => {
    onChange(
      sections.map((section, currentIndex) =>
        currentIndex === sectionIndex ? { ...section, ...patch } : section,
      ),
    )
  }

  const removeSection = (sectionIndex: number) => {
    const nextSections = sections.filter((_, currentIndex) => currentIndex !== sectionIndex)

    setSelectedSectionIndex((current) => {
      if (current < sectionIndex) {
        return current
      }

      if (current > sectionIndex) {
        return current - 1
      }

      return sectionIndex < nextSections.length ? sectionIndex : Math.max(sectionIndex - 1, 0)
    })

    onChange(nextSections)
  }

  const addSectionField = (sectionIndex: number) => {
    onChange(
      sections.map((section, currentIndex) =>
        currentIndex === sectionIndex
          ? {
              ...section,
              fields: [...section.fields, createEmptyFormFieldDraft()],
            }
          : section,
      ),
    )
  }

  const updateSectionField = (
    sectionIndex: number,
    fieldIndex: number,
    patch: Partial<FormFieldDraft>,
  ) => {
    onChange(
      sections.map((section, currentIndex) =>
        currentIndex === sectionIndex
          ? {
              ...section,
              fields: section.fields.map((field, currentFieldIndex) =>
                currentFieldIndex === fieldIndex ? { ...field, ...patch } : field,
              ),
            }
          : section,
      ),
    )
  }

  const removeSectionField = (sectionIndex: number, fieldIndex: number) => {
    onChange(
      sections.map((section, currentIndex) =>
        currentIndex === sectionIndex
          ? {
              ...section,
              fields: section.fields.filter(
                (_, currentFieldIndex) => currentFieldIndex !== fieldIndex,
              ),
            }
          : section,
      ),
    )
  }

  const updateLookupField = (
    sectionIndex: number,
    fieldIndex: number,
    field: keyof FormFieldDraft['lookup'],
    value: FormFieldDraft['lookup'][keyof FormFieldDraft['lookup']],
  ) => {
    onChange(
      sections.map((section, currentIndex) =>
        currentIndex === sectionIndex
          ? {
              ...section,
              fields: section.fields.map((entry, currentFieldIndex) =>
                currentFieldIndex === fieldIndex
                  ? {
                      ...entry,
                      lookup: {
                        ...entry.lookup,
                        [field]: value,
                      },
                    }
                  : entry,
              ),
            }
          : section,
      ),
    )
  }

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = getIndexFromSortableId(String(active.id), 'section')
    const newIndex = getIndexFromSortableId(String(over.id), 'section')

    if (oldIndex === null || newIndex === null) {
      return
    }

    onChange(arrayMove(sections, oldIndex, newIndex))
    setSelectedSectionIndex(newIndex)
  }

  const handleFieldDragEnd = ({ active, over }: DragEndEvent) => {
    if (!selectedSection || !over || active.id === over.id) {
      return
    }

    const oldIndex = getIndexFromSortableId(String(active.id), 'field')
    const newIndex = getIndexFromSortableId(String(over.id), 'field')

    if (oldIndex === null || newIndex === null) {
      return
    }

    const nextFields = arrayMove(selectedSection.fields, oldIndex, newIndex)
    updateSection(resolvedSelectedSectionIndex, {
      fields: nextFields,
    })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Sections
            </p>
            <p className="mt-1 text-sm text-slate-600">{sections.length} configurate</p>
          </div>

          <button
            type="button"
            onClick={addSection}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-white"
          >
            Aggiungi
          </button>
        </div>

        <div className="mt-4">
          {sections.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionDragEnd}
            >
              <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {sections.map((section, index) => (
                    <SortableFormSectionListItem
                      key={createSectionItemId(index)}
                      itemId={createSectionItemId(index)}
                      section={section}
                      index={index}
                      isActive={index === resolvedSelectedSectionIndex}
                      onRemove={() => removeSection(index)}
                      onSelect={() => setSelectedSectionIndex(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
              Nessuna section configurata.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {selectedSection ? (
          <>
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Active Section
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {selectedSection.title.trim() || 'Section senza titolo'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Modifica una section alla volta e riordina campi e sezioni dal workspace attivo.
                </p>
              </div>

              <button
                type="button"
                onClick={() => addSectionField(resolvedSelectedSectionIndex)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Aggiungi Field
              </button>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Section Title
              <input
                type="text"
                value={selectedSection.title}
                onChange={(event) =>
                  updateSection(resolvedSelectedSectionIndex, {
                    title: event.target.value,
                  })
                }
                placeholder="Opzionale"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <div className="mt-5">
              {selectedSection.fields.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleFieldDragEnd}
                >
                  <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {selectedSection.fields.map((field, fieldIndex) => (
                        <SortableFormFieldEditorRow
                          key={createFieldItemId(fieldIndex)}
                          itemId={createFieldItemId(fieldIndex)}
                          field={field}
                          fieldIndex={fieldIndex}
                          objectApiName={objectApiName}
                          onChange={(patch) =>
                            updateSectionField(resolvedSelectedSectionIndex, fieldIndex, patch)
                          }
                          onRemove={() =>
                            removeSectionField(resolvedSelectedSectionIndex, fieldIndex)
                          }
                          onLookupChange={(lookupField, value) =>
                            updateLookupField(
                              resolvedSelectedSectionIndex,
                              fieldIndex,
                              lookupField,
                              value,
                            )
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-700">
                    Nessun field in questa section.
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Aggiungi il primo field per comporre il layout del form.
                  </p>
                  <button
                    type="button"
                    onClick={() => addSectionField(resolvedSelectedSectionIndex)}
                    className="mt-4 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-white"
                  >
                    Aggiungi Field
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
            <p className="text-base font-semibold text-slate-900">
              Nessuna section selezionata
            </p>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              Crea la prima section per iniziare a organizzare i campi del form.
            </p>
            <button
              type="button"
              onClick={addSection}
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Aggiungi Sezione
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

type SortableFormSectionListItemProps = {
  itemId: string
  section: FormSectionDraft
  index: number
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
}

function SortableFormSectionListItem({
  itemId,
  section,
  index,
  isActive,
  onSelect,
  onRemove,
}: SortableFormSectionListItemProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: itemId,
  })
  const previewFields = describeFormSectionPreviewFields(section.fields)
  const compactPreview = previewFields.slice(0, 2)
  const extraPreviewCount = Math.max(previewFields.length - compactPreview.length, 0)

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-2xl border bg-white p-3 shadow-sm transition ${
        isActive
          ? 'border-sky-300 ring-2 ring-sky-100'
          : 'border-slate-200 hover:border-slate-300'
      } ${isDragging ? 'opacity-80 shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-3">
        <DragHandle
          activatorRef={setActivatorNodeRef}
          attributes={attributes}
          listeners={listeners}
          label={`Riordina section ${section.title.trim() || index + 1}`}
        />

        <div className="min-w-0 flex-1">
          <button type="button" onClick={onSelect} className="block w-full text-left">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold leading-5 text-slate-900">
                  {section.title.trim() || `Section ${index + 1}`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {section.fields.length} field configurati
                </p>
              </div>
              {isActive ? (
                <span className="w-fit rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                  Attiva
                </span>
              ) : null}
            </div>
          </button>

          <div className="mt-3 flex flex-wrap gap-2">
            {compactPreview.length > 0 ? (
              compactPreview.map((previewField, previewIndex) => (
                <span
                  key={`${itemId}-preview-${previewIndex}`}
                  className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                  title={previewField.label}
                >
                  {previewField.label}
                  {previewField.required ? ' (required)' : ''}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-slate-400">Nessun contenuto</span>
            )}

            {extraPreviewCount > 0 ? (
              <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-700">
                +{extraPreviewCount}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
            >
              Rimuovi
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

type SortableFormFieldEditorRowProps = {
  itemId: string
  field: FormFieldDraft
  fieldIndex: number
  objectApiName: string
  onChange: (patch: Partial<FormFieldDraft>) => void
  onRemove: () => void
  onLookupChange: (
    field: keyof FormFieldDraft['lookup'],
    value: FormFieldDraft['lookup'][keyof FormFieldDraft['lookup']],
  ) => void
}

function SortableFormFieldEditorRow({
  itemId,
  field,
  fieldIndex,
  objectApiName,
  onChange,
  onRemove,
  onLookupChange,
}: SortableFormFieldEditorRowProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: itemId,
  })
  const summary = getFormFieldSummary(field, fieldIndex)

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-2xl border border-slate-200 bg-slate-50 p-3 transition ${
        isDragging ? 'opacity-80 shadow-lg' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <DragHandle
          activatorRef={setActivatorNodeRef}
          attributes={attributes}
          listeners={listeners}
          label={`Riordina ${summary}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{summary}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge>{field.inputType || 'Input type'}</StatusBadge>
                {field.required ? <StatusBadge>Required</StatusBadge> : null}
                {field.lookupEnabled ? <StatusBadge>Lookup</StatusBadge> : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onRemove}
              className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
            >
              Rimuovi
            </button>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="grid gap-3 xl:grid-cols-2">
              <SalesforceFieldSingleInput
                label="Field"
                objectApiName={objectApiName}
                value={field.field}
                helperText="Supporta anche inserimento manuale per path relazionali come `Owner.Name`."
                onChange={(nextValue) =>
                  onChange({
                    field: nextValue,
                  })
                }
              />

              <label className="text-xs font-medium text-slate-600">
                Label
                <input
                  type="text"
                  value={field.label}
                  onChange={(event) =>
                    onChange({
                      label: event.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-xs font-medium text-slate-600">
                Input Type
                <select
                  value={field.inputType}
                  onChange={(event) =>
                    onChange({
                      inputType: event.target.value as FormFieldDraft['inputType'],
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Seleziona tipo</option>
                  {INPUT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-medium text-slate-600">
                Placeholder
                <input
                  type="text"
                  value={field.placeholder}
                  onChange={(event) =>
                    onChange({
                      placeholder: event.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) =>
                    onChange({
                      required: event.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
                />
                Required
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={field.lookupEnabled}
                  onChange={(event) =>
                    onChange({
                      lookupEnabled: event.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
                />
                Lookup
              </label>
            </div>

            {field.lookupEnabled ? (
              <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="text-xs font-medium text-slate-600">
                    Lookup Search Field
                    <input
                      type="text"
                      value={field.lookup.searchField}
                      onChange={(event) =>
                        onLookupChange('searchField', event.target.value)
                      }
                      placeholder="Default: Name"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 self-end text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={field.lookup.prefill}
                      onChange={(event) =>
                        onLookupChange('prefill', event.target.checked)
                      }
                      className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
                    />
                    Prefill
                  </label>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <QueryWhereJsonArrayEditor
                    value={field.lookup.whereJson}
                    availableFields={[]}
                    onChange={(nextValue) => onLookupChange('whereJson', nextValue)}
                  />

                  <QueryOrderByJsonArrayEditor
                    value={field.lookup.orderByJson}
                    availableFields={[]}
                    onChange={(nextValue) => onLookupChange('orderByJson', nextValue)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

type DragHandleProps = {
  activatorRef: (element: HTMLButtonElement | null) => void
  attributes: DraggableAttributes
  label: string
  listeners: Record<string, unknown> | undefined
}

function DragHandle({
  activatorRef,
  attributes,
  label,
  listeners,
}: DragHandleProps) {
  return (
    <button
      ref={activatorRef}
      type="button"
      aria-label={label}
      {...attributes}
      {...listeners}
      className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="h-4 w-4"
        fill="currentColor"
      >
        <path d="M7 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 13a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
      </svg>
    </button>
  )
}

function StatusBadge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  )
}

function createSectionItemId(index: number): string {
  return `section-${index}`
}

function createFieldItemId(index: number): string {
  return `field-${index}`
}

function getIndexFromSortableId(
  value: string,
  prefix: 'section' | 'field',
): number | null {
  const rawIndex = value.replace(`${prefix}-`, '')
  const index = Number(rawIndex)
  return Number.isNaN(index) ? null : index
}

function getFormFieldSummary(field: FormFieldDraft, fieldIndex: number): string {
  const summary = field.label.trim() || field.field.trim()
  return summary || `Field ${fieldIndex + 1}`
}
