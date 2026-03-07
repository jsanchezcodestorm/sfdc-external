import { useEffect } from "react";
import {
  formatFieldValue,
  formatFieldValueByFormat,
  renderRecordTemplate,
  resolveDisplayFieldValue,
  toLabel,
} from "../../entities/entity-helpers";
import type { EntityAction, EntityRecord } from "../../entities/entity-types";
import type {
  DetailPreviewModel,
  FormPreviewModel,
} from "../entities-admin-preview";

type EntityConfigPreviewModalProps =
  | {
      open: boolean;
      mode: "detail";
      preview: DetailPreviewModel;
      onClose: () => void;
    }
  | {
      open: boolean;
      mode: "form";
      preview: FormPreviewModel;
      onClose: () => void;
    };

export function EntityConfigPreviewModal({
  open,
  mode,
  preview,
  onClose,
}: EntityConfigPreviewModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

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
              {mode === "detail" ? "Detail Preview" : "Form Preview"}
            </p>
            <h3 className="text-lg font-semibold text-slate-900">
              {mode === "detail" ? preview.title : preview.title}
            </h3>
            {preview.subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{preview.subtitle}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">
          {preview.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Preview parziale</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {preview.warnings.map((warning, index) => (
                  <li key={`preview-warning-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={preview.warnings.length > 0 ? "mt-4" : ""}>
            {mode === "detail" ? (
              <DetailPreviewContent preview={preview} />
            ) : (
              <FormPreviewContent preview={preview} />
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
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
  );
}

type DetailPreviewContentProps = {
  preview: DetailPreviewModel;
};

function DetailPreviewContent({ preview }: DetailPreviewContentProps) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Runtime Layout
            </p>
            <h4 className="mt-1 text-2xl font-semibold text-slate-900">
              {preview.title}
            </h4>
            {preview.subtitle ? (
              <p className="mt-2 text-sm text-slate-600">{preview.subtitle}</p>
            ) : null}
          </div>

          {preview.actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preview.actions.map((action, index) => (
                <ActionChip
                  key={`detail-preview-action-${index}`}
                  action={action}
                />
              ))}
            </div>
          ) : null}
        </div>

        {preview.pathStatus ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Path Status
                </p>
                <h5 className="mt-1 text-sm font-semibold text-slate-900">
                  {toLabel(preview.pathStatus.field)}
                </h5>
              </div>

              {preview.pathStatus.allowUpdate ? (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  Update abilitato
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {preview.pathStatus.steps.map((step, index) => {
                const isCurrent = step.value === preview.currentPathStatusValue;

                return (
                  <span
                    key={`detail-preview-path-step-${index}`}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isCurrent
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {step.label ?? step.value}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {preview.sections.map((section, sectionIndex) => (
          <article
            key={`detail-preview-section-${sectionIndex}`}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Section
                </p>
                <h5 className="text-base font-semibold text-slate-900">
                  {section.title}
                </h5>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {section.fields.length} field
              </span>
            </div>

            {section.fields.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {section.fields.map((field, fieldIndex) => (
                  <DetailPreviewFieldCard
                    key={`detail-preview-section-${sectionIndex}-field-${fieldIndex}`}
                    record={preview.record}
                    field={field}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                Nessun field configurato.
              </p>
            )}
          </article>
        ))}

        {preview.sections.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Nessuna section valida da mostrare nella preview.
          </p>
        ) : null}
      </section>

      {preview.relatedLists.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Related Lists
              </p>
              <h4 className="mt-1 text-lg font-semibold text-slate-900">
                {preview.relatedLists.length} configurate
              </h4>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {preview.relatedLists.map((relatedList, index) => (
              <article
                key={`detail-preview-related-list-${index}`}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h5 className="text-base font-semibold text-slate-900">
                      {relatedList.label}
                    </h5>
                    {relatedList.description ? (
                      <p className="mt-1 text-sm text-slate-500">
                        {relatedList.description}
                      </p>
                    ) : null}
                  </div>

                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {relatedList.id}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {relatedList.entityId ? (
                    <PreviewTag>{`Entity ${relatedList.entityId}`}</PreviewTag>
                  ) : null}
                  {relatedList.objectApiName ? (
                    <PreviewTag>{relatedList.objectApiName}</PreviewTag>
                  ) : null}
                  <PreviewTag>{`${relatedList.queryFieldCount} query fields`}</PreviewTag>
                  <PreviewTag>{`${relatedList.columns.length} columns`}</PreviewTag>
                  <PreviewTag>{`${relatedList.actions.length} actions`}</PreviewTag>
                  <PreviewTag>{`${relatedList.rowActions.length} row actions`}</PreviewTag>
                </div>

                {relatedList.columns.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Columns
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {relatedList.columns.map((column) => (
                        <PreviewTag key={`${relatedList.id}-${column.field}`}>
                          {column.label ?? toLabel(column.field)}
                        </PreviewTag>
                      ))}
                    </div>
                  </div>
                ) : null}

                {relatedList.actions.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Actions
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {relatedList.actions.map((action, actionIndex) => (
                        <ActionChip
                          key={`${relatedList.id}-action-${actionIndex}`}
                          action={action}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {relatedList.rowActions.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Row Actions
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {relatedList.rowActions.map((action, actionIndex) => (
                        <ActionChip
                          key={`${relatedList.id}-row-action-${actionIndex}`}
                          action={action}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

type DetailPreviewFieldCardProps = {
  record: EntityRecord;
  field: DetailPreviewModel["sections"][number]["fields"][number];
};

function DetailPreviewFieldCard({
  record,
  field,
}: DetailPreviewFieldCardProps) {
  const rawValue = field.template
    ? renderRecordTemplate(field.template, record).trim()
    : field.field
      ? resolveDisplayFieldValue(record, field.field)
      : undefined;

  const displayValue =
    typeof rawValue === "string" && field.template
      ? rawValue || "-"
      : formatFieldValueByFormat(rawValue, field.format);

  return (
    <div
      className={`rounded-xl border p-3 ${
        field.highlight
          ? "border-sky-200 bg-sky-50/70 sm:col-span-2"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {field.label}
      </p>
      <p
        className={`mt-2 text-slate-900 ${
          field.highlight ? "text-lg font-semibold" : "text-sm font-medium"
        }`}
      >
        {displayValue}
      </p>

      {field.field ? (
        <p className="mt-2 text-[11px] text-slate-500">{field.field}</p>
      ) : field.template ? (
        <p className="mt-2 text-[11px] text-slate-500">{field.template}</p>
      ) : null}
    </div>
  );
}

type FormPreviewContentProps = {
  preview: FormPreviewModel;
};

function FormPreviewContent({ preview }: FormPreviewContentProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Runtime Layout
          </p>
          <h4 className="mt-1 text-2xl font-semibold text-slate-900">
            {preview.title}
          </h4>
          {preview.subtitle ? (
            <p className="mt-2 text-sm text-slate-600">{preview.subtitle}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {preview.createTitle ? (
            <PreviewTag>{`Create: ${preview.createTitle}`}</PreviewTag>
          ) : null}
          {preview.editTitle ? (
            <PreviewTag>{`Edit: ${preview.editTitle}`}</PreviewTag>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {preview.sections.map((section, sectionIndex) => (
          <article
            key={`form-preview-section-${sectionIndex}`}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Section
                </p>
                <h5 className="text-base font-semibold text-slate-900">
                  {section.title}
                </h5>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {section.fields.length} field
              </span>
            </div>

            {section.fields.length > 0 ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {section.fields.map((field, fieldIndex) => (
                  <FormPreviewFieldCard
                    key={`form-preview-section-${sectionIndex}-field-${fieldIndex}`}
                    field={field}
                    values={preview.values}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                Nessun field configurato.
              </p>
            )}
          </article>
        ))}

        {preview.sections.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
            Nessuna section valida da mostrare nella preview.
          </p>
        ) : null}
      </div>
    </section>
  );
}

type FormPreviewFieldCardProps = {
  field: FormPreviewModel["sections"][number]["fields"][number];
  values: EntityRecord;
};

function FormPreviewFieldCard({ field, values }: FormPreviewFieldCardProps) {
  const rawValue = field.field
    ? resolveDisplayFieldValue(values, field.field)
    : undefined;
  const formattedValue = formatFieldValue(rawValue);
  const controlValue = formattedValue === "-" ? "" : formattedValue;
  const showTextarea = field.inputType === "textarea";

  return (
    <div className={showTextarea ? "lg:col-span-2" : undefined}>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-slate-700">
            {field.label}
          </label>
          {field.required ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
              Required
            </span>
          ) : null}
          {field.lookup ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
              Lookup
            </span>
          ) : null}
        </div>

        {showTextarea ? (
          <textarea
            value={controlValue}
            readOnly
            placeholder={field.placeholder}
            rows={4}
            className="mt-2 block w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none"
          />
        ) : (
          <input
            type={field.inputType === "date" ? "date" : field.inputType}
            value={controlValue}
            readOnly
            placeholder={field.placeholder}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none"
          />
        )}

        {field.field ? (
          <p className="mt-2 text-[11px] text-slate-500">{field.field}</p>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">
            Field non selezionato.
          </p>
        )}

        {field.lookup ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {field.lookup.searchField ? (
              <PreviewTag>{`Search: ${field.lookup.searchField}`}</PreviewTag>
            ) : null}
            {field.lookup.prefill ? <PreviewTag>Prefill</PreviewTag> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ActionChipProps = {
  action: EntityAction;
};

function ActionChip({ action }: ActionChipProps) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
      {describeAction(action)}
    </span>
  );
}

type PreviewTagProps = {
  children: string;
};

function PreviewTag({ children }: PreviewTagProps) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
      {children}
    </span>
  );
}

function describeAction(action: EntityAction): string {
  if (action.label) {
    return action.label;
  }

  if (action.type === "edit") {
    return "Edit";
  }

  if (action.type === "delete") {
    return "Delete";
  }

  if (action.target) {
    return action.target;
  }

  return "Link";
}
