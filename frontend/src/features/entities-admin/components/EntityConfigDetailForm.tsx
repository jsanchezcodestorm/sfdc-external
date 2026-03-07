import { useMemo, useState } from "react";
import { QueryOrderByJsonArrayEditor } from "./QueryOrderByJsonArrayEditor";
import { QueryWhereJsonArrayEditor } from "./QueryWhereJsonArrayEditor";
import { RowActionsJsonArrayEditor } from "./RowActionsJsonArrayEditor";
import { SalesforceFieldMultiSelect } from "./SalesforceFieldMultiSelect";
import { EntityConfigPreviewModal } from "./EntityConfigPreviewModal";
import { DetailSectionsEditor } from "./detail-form/DetailSectionsEditor";
import { PathStatusEditor } from "./detail-form/PathStatusEditor";
import { RelatedListsEditor } from "./detail-form/RelatedListsEditor";
import type { DetailFormDraft } from "./detail-form/detail-form.types";
import { buildDetailPreviewModel } from "../entities-admin-preview";

type EntityConfigDetailFormProps = {
  value: DetailFormDraft;
  error: string | null;
  baseObjectApiName: string;
  onChange: (value: DetailFormDraft) => void;
};

export function EntityConfigDetailForm({
  value,
  error,
  baseObjectApiName,
  onChange,
}: EntityConfigDetailFormProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const preview = useMemo(() => buildDetailPreviewModel(value), [value]);

  const updateField = (
    field: keyof DetailFormDraft,
    nextValue: DetailFormDraft[keyof DetailFormDraft],
  ) => {
    onChange({
      ...value,
      [field]: nextValue,
    });
  };

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Form
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              Sezione DETAIL
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Preview read-only del layout detail con i campi attualmente
              selezionati.
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

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Query Object API Name
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
              onChange={(event) =>
                updateField("queryLimit", event.target.value)
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Title Template
            <input
              type="text"
              value={value.titleTemplate}
              onChange={(event) =>
                updateField("titleTemplate", event.target.value)
              }
              placeholder="{{Name}}"
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Fallback Title
            <input
              type="text"
              value={value.fallbackTitle}
              onChange={(event) =>
                updateField("fallbackTitle", event.target.value)
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700 lg:col-span-2">
            Subtitle
            <input
              type="text"
              value={value.subtitle}
              onChange={(event) => updateField("subtitle", event.target.value)}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>

        <div className="mt-5">
          <SalesforceFieldMultiSelect
            label="Query Fields"
            objectApiName={baseObjectApiName}
            value={value.queryFields}
            helperText="Campi caricati dalla query di dettaglio."
            onChange={(nextValue) => updateField("queryFields", nextValue)}
          />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <QueryWhereJsonArrayEditor
            value={value.queryWhereJson}
            objectApiName={baseObjectApiName}
            availableFields={value.queryFields}
            onChange={(nextValue) => updateField("queryWhereJson", nextValue)}
          />

          <QueryOrderByJsonArrayEditor
            value={value.queryOrderByJson}
            availableFields={value.queryFields}
            onChange={(nextValue) => updateField("queryOrderByJson", nextValue)}
          />
        </div>

        <div className="mt-5">
          <RowActionsJsonArrayEditor
            value={value.actionsJson}
            legend="Actions"
            description="Azioni disponibili nell’header del dettaglio."
            addLabel="Aggiungi Action"
            emptyMessage="Nessuna action configurata."
            onChange={(nextValue) => updateField("actionsJson", nextValue)}
          />
        </div>

        <div className="mt-5">
          <PathStatusEditor
            value={value}
            availableFields={value.queryFields}
            onChange={onChange}
          />
        </div>

        <div className="mt-5">
          <DetailSectionsEditor
            sections={value.sections}
            availableFields={value.queryFields}
            onChange={(nextSections) => updateField("sections", nextSections)}
          />
        </div>

        <div className="mt-5">
          <RelatedListsEditor
            value={value.relatedLists}
            onChange={(nextValue) => updateField("relatedLists", nextValue)}
          />
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      <EntityConfigPreviewModal
        open={isPreviewOpen}
        mode="detail"
        preview={preview}
        onClose={() => setIsPreviewOpen(false)}
      />
    </>
  );
}
