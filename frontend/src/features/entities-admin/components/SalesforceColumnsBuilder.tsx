import { useEffect, useMemo, useRef, useState } from 'react'

type SalesforceColumnsBuilderProps = {
  label: string
  objectApiName: string
  queryFields: string[]
  value: string
  helperText?: string
  onChange: (value: string) => void
}

type ColumnEntry = {
  field: string
  label: string
}

export function SalesforceColumnsBuilder({
  label,
  objectApiName,
  queryFields,
  value,
  helperText,
  onChange,
}: SalesforceColumnsBuilderProps) {
  const [searchInput, setSearchInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const normalizedObjectApiName = objectApiName.trim()
  const normalizedQueryFields = useMemo(
    () =>
      queryFields
        .map((field) => field.trim())
        .filter((field) => field.length > 0),
    [queryFields],
  )
  const queryFieldSet = useMemo(() => new Set(normalizedQueryFields), [normalizedQueryFields])
  const entries = useMemo(() => parseColumnsValue(value), [value])
  const selectedFields = useMemo(
    () => new Set(entries.map((entry) => entry.field)),
    [entries],
  )
  const normalizedSearchInput = searchInput.trim().toLowerCase()
  const selectableSuggestions = normalizedQueryFields.filter(
    (field) =>
      !selectedFields.has(field) &&
      (normalizedSearchInput.length === 0 || field.toLowerCase().includes(normalizedSearchInput)),
  )
  const shouldShowDropdown =
    isOpen && normalizedObjectApiName.length > 0 && normalizedQueryFields.length > 0

  useEffect(() => {
    if (entries.length === 0) {
      return
    }

    const filteredEntries = entries.filter((entry) => queryFieldSet.has(entry.field))
    if (filteredEntries.length !== entries.length) {
      onChange(formatColumnsValue(filteredEntries))
    }
  }, [entries, onChange, queryFieldSet])

  const replaceEntries = (nextEntries: ColumnEntry[]) => {
    onChange(formatColumnsValue(nextEntries))
  }

  const addField = (field: string) => {
    const normalizedField = field.trim()
    if (
      normalizedField.length === 0 ||
      selectedFields.has(normalizedField) ||
      !queryFieldSet.has(normalizedField)
    ) {
      return
    }

    replaceEntries([
      ...entries,
      {
        field: normalizedField,
        label: '',
      },
    ])
    setSearchInput('')
  }

  const removeField = (field: string) => {
    replaceEntries(entries.filter((entry) => entry.field !== field))
  }

  const changeLabel = (field: string, nextLabel: string) => {
    replaceEntries(
      entries.map((entry) =>
        entry.field === field ? { ...entry, label: nextLabel } : entry,
      ),
    )
  }

  const clearAll = () => {
    onChange('')
    setSearchInput('')
  }

  return (
    <div className="text-sm font-medium text-slate-700 md:col-span-2">
      <label>{label}</label>
      <div className="mt-2 rounded-xl border border-slate-300 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-2 shadow-sm">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {entries.length} colonne selezionate
          </p>
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
          {entries.length > 0 ? (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.field}
                  className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Field
                    </p>
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {entry.field}
                    </p>
                  </div>

                  <label className="text-xs font-medium text-slate-600">
                    Label (optional)
                    <input
                      type="text"
                      value={entry.label}
                      onChange={(event) => changeLabel(entry.field, event.target.value)}
                      placeholder="Custom label"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removeField(entry.field)}
                    className="self-end rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
                    aria-label={`Rimuovi ${entry.field}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Nessuna colonna selezionata</p>
          )}

          <div className="relative mt-2">
            <div
              className={`flex items-center gap-2 border px-2 py-1.5 ${
                shouldShowDropdown
                  ? 'rounded-t-md rounded-b-none border-slate-300 bg-white'
                  : 'rounded-md border-slate-200 bg-slate-50'
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-4 w-4 shrink-0 text-slate-400"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.5 3a5.5 5.5 0 0 1 4.357 8.857l3.643 3.643a1 1 0 0 1-1.414 1.414l-3.643-3.643A5.5 5.5 0 1 1 8.5 3Zm-3.5 5.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0Z"
                  clipRule="evenodd"
                />
              </svg>

              <input
                ref={inputRef}
                type="text"
                value={searchInput}
                onFocus={() => setIsOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setIsOpen(false), 120)
                }}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') {
                    return
                  }

                  const firstSuggestion = selectableSuggestions[0]
                  if (!firstSuggestion) {
                    return
                  }

                  event.preventDefault()
                  addField(firstSuggestion)
                }}
                disabled={
                  normalizedObjectApiName.length === 0 || normalizedQueryFields.length === 0
                }
                placeholder={
                  normalizedObjectApiName.length === 0
                    ? 'Imposta prima Object API Name in Base'
                    : normalizedQueryFields.length === 0
                      ? 'Seleziona prima Query Fields'
                      : 'Cerca tra i Query Fields...'
                }
                className="block w-full border-0 bg-transparent p-0 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
              />
            </div>

            {shouldShowDropdown ? (
              <div className="absolute left-0 top-full z-20 w-full overflow-hidden rounded-b-xl border border-slate-300 border-t-0 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.14)]">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {selectableSuggestions.length} campi disponibili
                  </p>
                </div>

                <div className="max-h-72 overflow-auto p-1.5">
                  {selectableSuggestions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      Nessun campo disponibile
                    </p>
                  ) : null}

                  {selectableSuggestions.length > 0
                    ? selectableSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => addField(suggestion)}
                          className="group flex w-full items-start justify-between rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {suggestion}
                            </p>
                          </div>
                        </button>
                      ))
                    : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {helperText ? <p className="mt-1 text-xs text-slate-500">{helperText}</p> : null}
    </div>
  )
}

function parseColumnsValue(value: string): ColumnEntry[] {
  const rows = value
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0)

  const entries: ColumnEntry[] = []
  const seen = new Set<string>()

  rows.forEach((row) => {
    const [fieldPart, ...labelParts] = row.split('|')
    const field = fieldPart.trim()
    if (field.length === 0 || seen.has(field)) {
      return
    }

    seen.add(field)
    entries.push({
      field,
      label: labelParts.join('|').trim(),
    })
  })

  return entries
}

function formatColumnsValue(entries: ColumnEntry[]): string {
  return entries
    .map((entry) => {
      const field = entry.field.trim()
      if (field.length === 0) {
        return ''
      }

      const label = entry.label.trim()
      return label.length > 0 ? `${field}|${label}` : field
    })
    .filter((entry) => entry.length > 0)
    .join('\n')
}
