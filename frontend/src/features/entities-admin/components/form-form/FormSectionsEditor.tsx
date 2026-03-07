import { useState } from "react";
import { describeFormSectionPreviewFields } from "../../entities-admin-preview";
import { QueryOrderByJsonArrayEditor } from "../QueryOrderByJsonArrayEditor";
import { QueryWhereJsonArrayEditor } from "../QueryWhereJsonArrayEditor";
import { SalesforceFieldSingleInput } from "../SalesforceFieldSingleInput";
import {
  createEmptyFormFieldDraft,
  createEmptyFormSectionDraft,
} from "./form-form.mapper";
import type { FormFieldDraft, FormSectionDraft } from "./form-form.types";

type FormSectionsEditorProps = {
  objectApiName: string;
  sections: FormSectionDraft[];
  onChange: (value: FormSectionDraft[]) => void;
};

const INPUT_TYPE_OPTIONS: Array<FormFieldDraft["inputType"]> = [
  "text",
  "email",
  "tel",
  "date",
  "textarea",
];

export function FormSectionsEditor({
  objectApiName,
  sections,
  onChange,
}: FormSectionsEditorProps) {
  const [collapsedByIndex, setCollapsedByIndex] = useState<
    Record<number, boolean>
  >({});

  const addSection = () => {
    onChange([...sections, createEmptyFormSectionDraft()]);
  };

  const updateSection = (index: number, patch: Partial<FormSectionDraft>) => {
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
              fields: [...section.fields, createEmptyFormFieldDraft()],
            }
          : section,
      ),
    );
  };

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

  const updateLookupField = (
    sectionIndex: number,
    fieldIndex: number,
    field: keyof FormFieldDraft["lookup"],
    value: FormFieldDraft["lookup"][keyof FormFieldDraft["lookup"]],
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
    );
  };

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Form Sections
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
          const previewFields = describeFormSectionPreviewFields(
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
              key={`form-section-${sectionIndex}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
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
                              key={`form-section-${sectionIndex}-preview-${previewIndex}`}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                            >
                              {previewField.label}
                              {previewField.required ? " (required)" : ""}
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
                      Editor completo della section attivo.
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
                      placeholder="Opzionale"
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
                          key={`form-section-${sectionIndex}-field-${fieldIndex}`}
                          className="rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <div className="grid gap-3 xl:grid-cols-2">
                            <SalesforceFieldSingleInput
                              label="Field"
                              objectApiName={objectApiName}
                              value={field.field}
                              helperText="Supporta anche inserimento manuale per path relazionali come `Owner.Name`."
                              onChange={(nextValue) =>
                                updateSectionField(sectionIndex, fieldIndex, {
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
                                  updateSectionField(sectionIndex, fieldIndex, {
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
                                  updateSectionField(sectionIndex, fieldIndex, {
                                    inputType: event.target
                                      .value as FormFieldDraft["inputType"],
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
                                  updateSectionField(sectionIndex, fieldIndex, {
                                    placeholder: event.target.value,
                                  })
                                }
                                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                              />
                            </label>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-4">
                              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(event) =>
                                    updateSectionField(
                                      sectionIndex,
                                      fieldIndex,
                                      {
                                        required: event.target.checked,
                                      },
                                    )
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
                                    updateSectionField(
                                      sectionIndex,
                                      fieldIndex,
                                      {
                                        lookupEnabled: event.target.checked,
                                      },
                                    )
                                  }
                                  className="h-4 w-4 rounded border border-slate-300 text-sky-600 focus:ring-sky-200"
                                />
                                Lookup
                              </label>
                            </div>

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

                          {field.lookupEnabled ? (
                            <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                              <div className="grid gap-3 lg:grid-cols-2">
                                <label className="text-xs font-medium text-slate-600">
                                  Lookup Search Field
                                  <input
                                    type="text"
                                    value={field.lookup.searchField}
                                    onChange={(event) =>
                                      updateLookupField(
                                        sectionIndex,
                                        fieldIndex,
                                        "searchField",
                                        event.target.value,
                                      )
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
                                      updateLookupField(
                                        sectionIndex,
                                        fieldIndex,
                                        "prefill",
                                        event.target.checked,
                                      )
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
                                  onChange={(nextValue) =>
                                    updateLookupField(
                                      sectionIndex,
                                      fieldIndex,
                                      "whereJson",
                                      nextValue,
                                    )
                                  }
                                />

                                <QueryOrderByJsonArrayEditor
                                  value={field.lookup.orderByJson}
                                  availableFields={[]}
                                  onChange={(nextValue) =>
                                    updateLookupField(
                                      sectionIndex,
                                      fieldIndex,
                                      "orderByJson",
                                      nextValue,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          ) : null}
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
