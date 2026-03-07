import { useState } from "react";
import { describeDetailSectionPreviewFields } from "../../entities-admin-preview";
import type { DetailFieldDraft, DetailSectionDraft } from "./detail-form.types";

type DetailSectionsEditorProps = {
  sections: DetailSectionDraft[];
  availableFields: string[];
  onChange: (value: DetailSectionDraft[]) => void;
};

export function DetailSectionsEditor({
  sections,
  availableFields,
  onChange,
}: DetailSectionsEditorProps) {
  const [collapsedByIndex, setCollapsedByIndex] = useState<
    Record<number, boolean>
  >({});

  const addSection = () => {
    onChange([
      ...sections,
      createEmptyDetailSectionDraft(`Section ${sections.length + 1}`),
    ]);
  };

  const updateSection = (index: number, patch: Partial<DetailSectionDraft>) => {
    onChange(
      sections.map((section, currentIndex) =>
        currentIndex === index ? { ...section, ...patch } : section,
      ),
    );
  };

  const removeSection = (index: number) => {
    setCollapsedByIndex((current) =>
      shiftCollapsedStateAfterRemoval(current, index),
    );
    onChange(sections.filter((_, currentIndex) => currentIndex !== index));
  };

  const toggleSectionCollapse = (index: number) => {
    setCollapsedByIndex((current) => ({
      ...current,
      [index]: !(current[index] ?? true),
    }));
  };

  const addSectionField = (sectionIndex: number) => {
    onChange(
      sections.map((section, currentIndex) =>
        currentIndex === sectionIndex
          ? {
              ...section,
              fields: [...section.fields, createEmptyDetailFieldDraft()],
            }
          : section,
      ),
    );
  };

  const updateSectionField = (
    sectionIndex: number,
    fieldIndex: number,
    patch: Partial<DetailFieldDraft>,
  ) => {
    onChange(
      sections.map((section, currentIndex) =>
        currentIndex === sectionIndex
          ? {
              ...section,
              fields: section.fields.map((field, currentFieldIndex) =>
                currentFieldIndex === fieldIndex
                  ? { ...field, ...patch }
                  : field,
              ),
            }
          : section,
      ),
    );
  };

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
    );
  };

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Detail Sections
      </legend>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {sections.length} sezioni configurate
        </p>
        <button
          type="button"
          onClick={addSection}
          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
        >
          Aggiungi Sezione
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {sections.map((section, sectionIndex) => {
          const fieldListId = `detail-section-field-options-${sectionIndex}`;
          const previewFields = describeDetailSectionPreviewFields(
            section.fields,
          );
          const compactPreviewFields = previewFields.slice(0, 3);
          const extraPreviewCount = Math.max(
            previewFields.length - compactPreviewFields.length,
            0,
          );
          const isCollapsed = collapsedByIndex[sectionIndex] ?? true;
          const sectionTitle =
            section.title.trim() || `Section ${sectionIndex + 1}`;

          return (
            <article
              key={`detail-section-${sectionIndex}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              {availableFields.length > 0 ? (
                <datalist id={fieldListId}>
                  {availableFields.map((field) => (
                    <option key={field} value={field} />
                  ))}
                </datalist>
              ) : null}

              <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {sectionTitle}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {previewFields.length} field
                    </span>
                  </div>

                  {isCollapsed ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {compactPreviewFields.length > 0 ? (
                        compactPreviewFields.map(
                          (previewField, previewIndex) => (
                            <span
                              key={`detail-section-${sectionIndex}-preview-${previewIndex}`}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                            >
                              {previewField}
                            </span>
                          ),
                        )
                      ) : (
                        <span className="text-xs text-slate-400">
                          Nessun field selezionato.
                        </span>
                      )}

                      {extraPreviewCount > 0 ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                          +{extraPreviewCount}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Espandi l’editor per modificare titolo, field e template
                      della section.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSectionCollapse(sectionIndex)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    {isCollapsed ? "Espandi" : "Collassa"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(sectionIndex)}
                    className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
                  >
                    Rimuovi Sezione
                  </button>
                </div>
              </div>

              {isCollapsed ? null : (
                <>
                  <label className="mt-4 block w-full text-sm font-medium text-slate-700">
                    Section Title
                    <input
                      type="text"
                      value={section.title}
                      onChange={(event) =>
                        updateSection(sectionIndex, {
                          title: event.target.value,
                        })
                      }
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Fields
                      </p>
                      <button
                        type="button"
                        onClick={() => addSectionField(sectionIndex)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                      >
                        Aggiungi Field
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {section.fields.map((field, fieldIndex) => (
                        <div
                          key={`detail-section-${sectionIndex}-field-${fieldIndex}`}
                          className="rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <div className="grid gap-3 lg:grid-cols-2">
                            <label className="text-xs font-medium text-slate-600">
                              Label
                              <input
                                type="text"
                                value={field.label}
                                onChange={(event) =>
                                  updateSectionField(sectionIndex, fieldIndex, {
                                    label: event.target.value,
                                  })
                                }
                                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                              />
                            </label>

                            <label className="text-xs font-medium text-slate-600">
                              Field
                              <input
                                list={fieldListId}
                                type="text"
                                value={field.field}
                                onChange={(event) =>
                                  updateSectionField(sectionIndex, fieldIndex, {
                                    field: event.target.value,
                                  })
                                }
                                placeholder="es. Owner.Name"
                                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                              />
                            </label>

                            <label className="text-xs font-medium text-slate-600 lg:col-span-2">
                              Template
                              <input
                                type="text"
                                value={field.template}
                                onChange={(event) =>
                                  updateSectionField(sectionIndex, fieldIndex, {
                                    template: event.target.value,
                                  })
                                }
                                placeholder="es. {{Owner.Name}}"
                                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                              />
                            </label>

                            <label className="text-xs font-medium text-slate-600">
                              Format
                              <select
                                value={field.format}
                                onChange={(event) =>
                                  updateSectionField(sectionIndex, fieldIndex, {
                                    format: event.target
                                      .value as DetailFieldDraft["format"],
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
                                  updateSectionField(sectionIndex, fieldIndex, {
                                    highlight: event.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
                              />
                              Highlight
                            </label>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                removeSectionField(sectionIndex, fieldIndex)
                              }
                              className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
                            >
                              Rimuovi Field
                            </button>
                          </div>
                        </div>
                      ))}

                      {section.fields.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          Nessun field configurato.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </article>
          );
        })}

        {sections.length === 0 ? (
          <p className="text-sm text-slate-400">Nessuna sezione configurata.</p>
        ) : null}
      </div>
    </fieldset>
  );
}

function createEmptyDetailSectionDraft(title = ""): DetailSectionDraft {
  return {
    title,
    fields: [createEmptyDetailFieldDraft()],
  };
}

function createEmptyDetailFieldDraft(): DetailFieldDraft {
  return {
    label: "",
    field: "",
    template: "",
    highlight: false,
    format: "",
  };
}

function shiftCollapsedStateAfterRemoval(
  state: Record<number, boolean>,
  removedIndex: number,
): Record<number, boolean> {
  const nextState: Record<number, boolean> = {};

  for (const [rawIndex, collapsed] of Object.entries(state)) {
    const index = Number(rawIndex);
    if (Number.isNaN(index) || index === removedIndex) {
      continue;
    }

    nextState[index > removedIndex ? index - 1 : index] = collapsed;
  }

  return nextState;
}
