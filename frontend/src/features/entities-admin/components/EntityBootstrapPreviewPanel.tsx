import type { ReactNode } from 'react'

import type { EntityAction } from '../../entities/entity-types'
import type { EntityAdminBootstrapPreviewResponse } from '../entity-admin-types'

type EntityBootstrapPreviewPanelProps = {
  preview: EntityAdminBootstrapPreviewResponse | null
  previewCurrent: boolean
  previewLoading: boolean
  previewError: string | null
  saving: boolean
  onGeneratePreview: () => void | Promise<void>
  onCreateWithPreset: () => void | Promise<void>
  onCreateBaseOnly: () => void | Promise<void>
}

export function EntityBootstrapPreviewPanel({
  preview,
  previewCurrent,
  previewLoading,
  previewError,
  saving,
  onGeneratePreview,
  onCreateWithPreset,
  onCreateBaseOnly,
}: EntityBootstrapPreviewPanelProps) {
  const previewEntity = preview?.entity
  const previewLayout =
    previewEntity?.layouts?.find((layout) => layout.isDefault) ?? previewEntity?.layouts?.[0]
  const viewCount = previewEntity?.list?.views?.length ?? 0
  const detailSectionCount = previewLayout?.detail?.sections?.length ?? 0
  const formSectionCount = previewLayout?.form?.sections?.length ?? 0
  const formFieldCount =
    previewLayout?.form?.sections?.reduce(
      (total, section) => total + (section.fields?.length ?? 0),
      0,
    ) ?? 0
  const listRowActions = previewEntity?.list?.views?.[0]?.rowActions ?? []
  const detailActions = previewLayout?.detail?.actions ?? []
  const canCreateWithPreset = Boolean(preview && previewCurrent && !previewLoading && !saving)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Starter preset
          </p>
          <h2 className="text-lg font-semibold text-slate-900">Bootstrap da metadata Salesforce</h2>
          <p className="mt-2 text-sm text-slate-600">
            Genera una preview iniziale di base, list, detail e form a partire dall&apos;Object
            API Name. La preview non salva nulla finché non scegli di creare la entity.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGeneratePreview}
            disabled={previewLoading || saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {previewLoading
              ? 'Generazione...'
              : preview
              ? 'Rigenera preview'
              : 'Genera preview'}
          </button>
          <button
            type="button"
            onClick={() => {
              void onCreateWithPreset()
            }}
            disabled={!canCreateWithPreset}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Creazione...' : 'Crea entity con preset'}
          </button>
          <button
            type="button"
            onClick={() => {
              void onCreateBaseOnly()
            }}
            disabled={saving || previewLoading}
            className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-medium text-sky-800 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-65"
          >
            Crea solo base
          </button>
        </div>
      </div>

      {previewError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {previewError}
        </p>
      ) : null}

      {!preview ? (
        <p className="mt-4 text-sm text-slate-600">
          Compila i campi base e genera la preview per controllare il preset iniziale prima del
          salvataggio.
        </p>
      ) : null}

      {preview && !previewCurrent ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          La preview non e piu allineata ai valori base correnti. Rigenerala prima di creare la
          entity con preset.
        </p>
      ) : null}

      {preview && previewCurrent ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Preview pronta. Se il risultato ti convince puoi creare subito la entity con il preset.
        </p>
      ) : null}

      {preview ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PreviewChip label="List views" value={String(viewCount)} />
            <PreviewChip label="Detail sections" value={String(detailSectionCount)} />
            <PreviewChip label="Form sections" value={String(formSectionCount)} />
            <PreviewChip label="Form fields" value={String(formFieldCount)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <PreviewBlock label="List preset">
              <p>Primary action: {previewEntity?.list?.primaryAction?.label ?? 'Nuovo'}</p>
              <p>Row actions: {formatActionLabels(listRowActions)}</p>
            </PreviewBlock>

            <PreviewBlock label="Detail preset">
              <p>Title template: {previewLayout?.detail?.titleTemplate ?? '-'}</p>
              <p>Actions: {formatActionLabels(detailActions)}</p>
            </PreviewBlock>
          </div>

          <PreviewBlock label="Warnings">
            {preview.warnings.length > 0 ? (
              <ul className="space-y-2">
                {preview.warnings.map((warning) => (
                  <li key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nessun warning generato.</p>
            )}
          </PreviewBlock>
        </div>
      ) : null}
    </section>
  )
}

function PreviewChip({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </article>
  )
}

function PreviewBlock({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </article>
  )
}

function formatActionLabels(actions: EntityAction[]): string {
  if (actions.length === 0) {
    return '-'
  }

  return actions.map((action) => action.label ?? action.type).join(', ')
}
