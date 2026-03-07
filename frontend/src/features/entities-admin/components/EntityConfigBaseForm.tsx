type EntityConfigBaseFormValue = {
  id: string
  label: string
  description: string
  objectApiName: string
  basePath: string
}

type EntityConfigBaseFormField = keyof EntityConfigBaseFormValue

type EntityObjectApiSuggestion = {
  name: string
  label: string
  custom: boolean
}

type EntityConfigBaseFormProps = {
  value: EntityConfigBaseFormValue
  error: string | null
  onChange: (field: EntityConfigBaseFormField, value: string) => void
  suggestions: EntityObjectApiSuggestion[]
  suggestionsLoading: boolean
  suggestionsError: string | null
  showSuggestions: boolean
  onSelectSuggestion: (objectApiName: string) => void
  onApply: () => void
  eyebrow?: string
  title?: string
  applyLabel?: string
  showApplyButton?: boolean
}

export function EntityConfigBaseForm({
  value,
  error,
  onChange,
  suggestions,
  suggestionsLoading,
  suggestionsError,
  showSuggestions,
  onSelectSuggestion,
  onApply,
  eyebrow = 'Form',
  title = 'Sezione BASE',
  applyLabel = 'Applica Modifiche Base',
  showApplyButton = true,
}: EntityConfigBaseFormProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {eyebrow}
          </p>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        {showApplyButton ? (
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {applyLabel}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Entity Id
          <input
            type="text"
            value={value.id}
            onChange={(event) => onChange('id', event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
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

        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Description
          <textarea
            value={value.description}
            onChange={(event) => onChange('description', event.target.value)}
            rows={3}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Object API Name
          <div className="relative mt-2">
            <input
              type="text"
              value={value.objectApiName}
              onChange={(event) => onChange('objectApiName', event.target.value)}
              placeholder="es. Account, Opportunity, CustomObject__c"
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />

            {showSuggestions ? (
              <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {suggestionsLoading ? (
                  <p className="px-3 py-2 text-xs text-slate-500">
                    Ricerca object Salesforce...
                  </p>
                ) : null}

                {!suggestionsLoading && suggestionsError ? (
                  <p className="px-3 py-2 text-xs text-rose-600">{suggestionsError}</p>
                ) : null}

                {!suggestionsLoading &&
                !suggestionsError &&
                suggestions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">
                    Nessun risultato
                  </p>
                ) : null}

                {!suggestionsLoading &&
                !suggestionsError &&
                suggestions.length > 0
                  ? suggestions.map((suggestion) => (
                      <button
                        key={suggestion.name}
                        type="button"
                        onClick={() => onSelectSuggestion(suggestion.name)}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition hover:bg-slate-100"
                      >
                        <span className="text-sm text-slate-800">{suggestion.name}</span>
                        <span className="ml-3 flex items-center gap-2 text-xs text-slate-500">
                          {suggestion.label}
                          {suggestion.custom ? (
                            <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                              custom
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
          </div>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Navigation Base Path
          <input
            type="text"
            value={value.basePath}
            onChange={(event) => onChange('basePath', event.target.value)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  )
}
