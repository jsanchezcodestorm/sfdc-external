import {
  DndContext,
  type DraggableAttributes,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState } from 'react'

import { describeDetailSectionPreviewFields } from '../../entities-admin-preview'
import { SalesforceFieldSingleInput } from '../SalesforceFieldSingleInput'
import {
  createEmptyDetailFieldDraft,
  createEmptyDetailSectionDraft,
} from './detail-form.mapper'
import type { DetailFieldDraft, DetailSectionDraft } from './detail-form.types'

type DetailSectionsEditorProps = {
  objectApiName: string
  sections: DetailSectionDraft[]
  preferredFields: string[]
  onChange: (value: DetailSectionDraft[]) => void
}

export function DetailSectionsEditor({
  objectApiName,
  sections,
  preferredFields,
  onChange,
}: DetailSectionsEditorProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    sections[0]?.clientId ?? null,
  )
  const [expandedFieldIds, setExpandedFieldIds] = useState<Record<string, boolean>>({})
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

  const selectedSection = useMemo(
    () =>
      sections.find((section) => section.clientId === selectedSectionId) ??
      sections[0] ??
      null,
    [sections, selectedSectionId],
  )

  const sectionIds = useMemo(
    () => sections.map((section) => section.clientId),
    [sections],
  )
  const fieldIds = useMemo(
    () => selectedSection?.fields.map((field) => field.clientId) ?? [],
    [selectedSection],
  )
  const defaultFieldPath = useMemo(
    () => pickDefaultDetailField(preferredFields),
    [preferredFields],
  )
  const showMissingFieldHint = Boolean(
    selectedSection &&
      selectedSection.fields.every(
        (field) =>
          field.field.trim().length === 0 &&
          field.template.trim().length === 0 &&
          field.label.trim().length === 0,
      ),
  )

  useEffect(() => {
    if (!defaultFieldPath) {
      return
    }

    let touched = false
    const nextSections = sections.map((section) => {
      const hasConfiguredField = section.fields.some(
        (field) =>
          field.field.trim().length > 0 ||
          field.template.trim().length > 0 ||
          field.label.trim().length > 0 ||
          field.highlight ||
          field.format.length > 0,
      )

      if (hasConfiguredField) {
        return section
      }

      if (section.fields.length === 0) {
        touched = true
        return {
          ...section,
          fields: [createEmptyDetailFieldDraft(defaultFieldPath)],
        }
      }

      const firstField = section.fields[0]
      if (firstField.field.trim().length > 0) {
        return section
      }

      touched = true
      return {
        ...section,
        fields: [
          {
            ...firstField,
            field: defaultFieldPath,
          },
          ...section.fields.slice(1),
        ],
      }
    })

    if (touched) {
      onChange(nextSections)
    }
  }, [defaultFieldPath, onChange, sections])

  const addSection = () => {
    const nextSection = createEmptyDetailSectionDraft(
      `Section ${sections.length + 1}`,
      defaultFieldPath,
    )
    setSelectedSectionId(nextSection.clientId)
    setExpandedFieldIds((current) => ({
      ...current,
      [nextSection.fields[0].clientId]: true,
    }))
    onChange([...sections, nextSection])
  }

  const updateSection = (
    sectionId: string,
    patch: Partial<DetailSectionDraft>,
  ) => {
    onChange(
      sections.map((section) =>
        section.clientId === sectionId ? { ...section, ...patch } : section,
      ),
    )
  }

  const removeSection = (sectionId: string) => {
    const sectionIndex = sections.findIndex((section) => section.clientId === sectionId)

    if (sectionIndex < 0) {
      return
    }

    const nextSections = sections.filter((section) => section.clientId !== sectionId)

    setSelectedSectionId((current) => {
      if (current !== sectionId) {
        return current
      }

      const fallbackSection =
        nextSections[sectionIndex] ?? nextSections[sectionIndex - 1] ?? null
      return fallbackSection?.clientId ?? null
    })

    onChange(nextSections)
  }

  const addField = (sectionId: string) => {
    const nextField = createEmptyDetailFieldDraft(defaultFieldPath)
    setExpandedFieldIds((current) => ({
      ...current,
      [nextField.clientId]: true,
    }))
    onChange(
      sections.map((section) =>
        section.clientId === sectionId
          ? {
              ...section,
              fields: [...section.fields, nextField],
            }
          : section,
      ),
    )
  }

  const updateField = (
    sectionId: string,
    fieldId: string,
    patch: Partial<DetailFieldDraft>,
  ) => {
    onChange(
      sections.map((section) =>
        section.clientId === sectionId
          ? {
              ...section,
              fields: section.fields.map((field) =>
                field.clientId === fieldId ? applyDetailFieldPatch(field, patch) : field,
              ),
            }
          : section,
      ),
    )
  }

  const removeField = (sectionId: string, fieldId: string) => {
    setExpandedFieldIds((current) => {
      if (!(fieldId in current)) {
        return current
      }

      const next = { ...current }
      delete next[fieldId]
      return next
    })

    onChange(
      sections.map((section) =>
        section.clientId === sectionId
          ? {
              ...section,
              fields: section.fields.filter((field) => field.clientId !== fieldId),
            }
          : section,
      ),
    )
  }

  const toggleFieldExpanded = (fieldId: string) => {
    setExpandedFieldIds((current) => ({
      ...current,
      [fieldId]: !(current[fieldId] ?? false),
    }))
  }

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = sections.findIndex((section) => section.clientId === active.id)
    const newIndex = sections.findIndex((section) => section.clientId === over.id)

    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    onChange(arrayMove(sections, oldIndex, newIndex))
    setSelectedSectionId(String(active.id))
  }

  const handleFieldDragEnd = ({ active, over }: DragEndEvent) => {
    if (!selectedSection || !over || active.id === over.id) {
      return
    }

    const oldIndex = selectedSection.fields.findIndex((field) => field.clientId === active.id)
    const newIndex = selectedSection.fields.findIndex((field) => field.clientId === over.id)

    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    const nextFields = arrayMove(selectedSection.fields, oldIndex, newIndex)
    updateSection(selectedSection.clientId, {
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
            <p className="mt-1 text-sm text-slate-600">
              {sections.length} configurate
            </p>
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
                    <SortableSectionListItem
                      key={section.clientId}
                      section={section}
                      index={index}
                      isActive={section.clientId === selectedSection?.clientId}
                      onRemove={() => removeSection(section.clientId)}
                      onSelect={() => setSelectedSectionId(section.clientId)}
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
                  Modifica una section alla volta e riordina field e sezioni con drag & drop.
                </p>
              </div>

              <button
                type="button"
                onClick={() => addField(selectedSection.clientId)}
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
                  updateSection(selectedSection.clientId, {
                    title: event.target.value,
                  })
                }
                placeholder="es. Overview"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <div className="mt-5">
              {showMissingFieldHint && !defaultFieldPath ? (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Prima seleziona almeno un campo in <strong>Header &amp; Query / Query Fields</strong>, poi questa section verrà precompilata automaticamente.
                </p>
              ) : null}
              {selectedSection.fields.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleFieldDragEnd}
                >
                  <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {selectedSection.fields.map((field, index) => (
                        <SortableFieldEditorRow
                          key={field.clientId}
                          field={field}
                          fieldIndex={index}
                          objectApiName={objectApiName}
                          expanded={expandedFieldIds[field.clientId] ?? false}
                          onChange={(patch) =>
                            updateField(selectedSection.clientId, field.clientId, patch)
                          }
                          onRemove={() =>
                            removeField(selectedSection.clientId, field.clientId)
                          }
                          onToggleExpanded={() => toggleFieldExpanded(field.clientId)}
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
                    Aggiungi il primo field per comporre il layout di dettaglio.
                  </p>
                  <button
                    type="button"
                    onClick={() => addField(selectedSection.clientId)}
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
              Crea la prima section per iniziare a organizzare i campi del dettaglio.
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

function pickDefaultDetailField(preferredFields: string[]): string | undefined {
  const normalized = preferredFields.map((entry) => entry.trim()).filter(Boolean)
  if (normalized.length === 0) {
    return undefined
  }

  const nameField = normalized.find((field) => field === 'Name')
  return nameField ?? normalized[0]
}

type SortableSectionListItemProps = {
  section: DetailSectionDraft
  index: number
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
}

function SortableSectionListItem({
  section,
  index,
  isActive,
  onSelect,
  onRemove,
}: SortableSectionListItemProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: section.clientId,
    })
  const previewFields = describeDetailSectionPreviewFields(section.fields)
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
          <button
            type="button"
            onClick={onSelect}
            className="block w-full text-left"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-5 text-slate-900 break-words">
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
              compactPreview.map((field, previewIndex) => (
                <span
                  key={`${section.clientId}-preview-${previewIndex}`}
                  className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                  title={field}
                >
                  {field}
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

type SortableFieldEditorRowProps = {
  field: DetailFieldDraft
  fieldIndex: number
  objectApiName: string
  expanded: boolean
  onChange: (patch: Partial<DetailFieldDraft>) => void
  onRemove: () => void
  onToggleExpanded: () => void
}

function SortableFieldEditorRow({
  field,
  fieldIndex,
  objectApiName,
  expanded,
  onChange,
  onRemove,
  onToggleExpanded,
}: SortableFieldEditorRowProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: field.clientId,
    })
  const summary = getDetailFieldSummary(field, fieldIndex)

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-2xl border border-slate-200 bg-slate-50 p-3 transition ${
        isDragging ? 'shadow-lg opacity-80' : ''
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
                <StatusBadge>{field.sourceMode === 'template' ? 'Template' : 'Field'}</StatusBadge>
                {field.highlight ? <StatusBadge>Highlight</StatusBadge> : null}
                {field.format ? <StatusBadge>{field.format}</StatusBadge> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onToggleExpanded}
                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                {expanded ? 'Riduci' : 'Espandi'}
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
              >
                Rimuovi
              </button>
            </div>
          </div>

          {expanded ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_14rem]">
                <label className="text-sm font-medium text-slate-700">
                  Label
                  <input
                    type="text"
                    value={field.label}
                    onChange={(event) =>
                      onChange({
                        label: event.target.value,
                      })
                    }
                    placeholder="es. Account Owner"
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                <div>
                  <p className="text-sm font-medium text-slate-700">Source</p>
                  <div className="mt-2 inline-flex rounded-lg border border-slate-300 bg-white p-1">
                    <SourceModeButton
                      active={field.sourceMode === 'field'}
                      label="Field"
                      onClick={() =>
                        onChange({
                          sourceMode: 'field',
                          template: '',
                        })
                      }
                    />
                    <SourceModeButton
                      active={field.sourceMode === 'template'}
                      label="Template"
                      onClick={() =>
                        onChange({
                          sourceMode: 'template',
                          field: '',
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                {field.sourceMode === 'template' ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Template
                    <input
                      type="text"
                      value={field.template}
                      onChange={(event) =>
                        onChange({
                          template: event.target.value,
                        })
                      }
                      placeholder="es. {{Owner.Name}}"
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Usa template per combinare o trasformare valori nel layout detail.
                    </p>
                  </label>
                ) : (
                  <SalesforceFieldSingleInput
                    label="Field"
                    objectApiName={objectApiName}
                    value={field.field}
                    helperText="Supporta anche path relazionali come `Owner.Name`."
                    onChange={(nextValue) =>
                      onChange({
                        field: nextValue,
                      })
                    }
                  />
                )}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Presentation
                </p>
                <div className="mt-3 grid gap-4 lg:grid-cols-[12rem_auto]">
                  <label className="text-xs font-medium text-slate-600">
                    Format
                    <select
                      value={field.format}
                      onChange={(event) =>
                        onChange({
                          format: event.target.value as DetailFieldDraft['format'],
                        })
                      }
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="">None</option>
                      <option value="date">date</option>
                      <option value="datetime">datetime</option>
                    </select>
                  </label>

                  <label className="inline-flex items-center gap-2 self-end text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={field.highlight}
                      onChange={(event) =>
                        onChange({
                          highlight: event.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
                    />
                    Highlight
                  </label>
                </div>
              </div>
            </div>
          ) : null}
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

function SourceModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition ${
        active
          ? 'bg-slate-900 text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
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

function applyDetailFieldPatch(
  currentField: DetailFieldDraft,
  patch: Partial<DetailFieldDraft>,
): DetailFieldDraft {
  const nextField = {
    ...currentField,
    ...patch,
  }

  if (patch.sourceMode === 'field') {
    nextField.template = ''
  }

  if (patch.sourceMode === 'template') {
    nextField.field = ''
  }

  return nextField
}

function getDetailFieldSummary(field: DetailFieldDraft, fieldIndex: number): string {
  const summary =
    field.label.trim() ||
    (field.sourceMode === 'template' ? field.template.trim() : field.field.trim())

  return summary || `Field ${fieldIndex + 1}`
}
