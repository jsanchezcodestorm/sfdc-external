import type { EntityConfigSectionKey } from '../entity-admin-types'

type EntityConfigSectionEditorProps = {
  section: EntityConfigSectionKey
  value: string
  error: string | null
  onChange: (value: string) => void
  onApply: () => void
}

export function EntityConfigSectionEditor({
  section,
  value,
  error,
  onChange,
  onApply,
}: EntityConfigSectionEditorProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Editor
          </p>
          <h2 className="text-lg font-semibold text-slate-900">
            Sezione {section.toUpperCase()}
          </h2>
        </div>
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Applica Sezione
        </button>
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="mt-4 h-[420px] w-full rounded-xl border border-slate-300 bg-slate-950 p-4 font-mono text-xs text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  )
}
