import { useEffect, useMemo, useRef, useState } from 'react'

import { searchEntityAdminObjectFields } from '../entity-admin-api'
import type { SalesforceObjectFieldSuggestion } from '../entity-admin-types'

type SalesforceFieldMultiSelectProps = {
  label: string
  objectApiName: string
  value: string[]
  placeholder?: string
  helperText?: string
  onChange: (value: string[]) => void
}

export function SalesforceFieldMultiSelect({
  label,
  objectApiName,
  value,
  placeholder,
  helperText,
  onChange,
}: SalesforceFieldMultiSelectProps) {
  const [searchInput, setSearchInput] = useState('')
  const [suggestions, setSuggestions] = useState<SalesforceObjectFieldSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const normalizedObjectApiName = objectApiName.trim()
  const selectedSet = useMemo(() => new Set(value), [value])
  const canLoadSuggestions = isOpen && normalizedObjectApiName.length > 0

  const selectableSuggestions = suggestions.filter(
    (entry) => !selectedSet.has(entry.name),
  )

  useEffect(() => {
    if (!canLoadSuggestions) {
      return
    }

    let cancelled = false

    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchEntityAdminObjectFields(normalizedObjectApiName, searchInput.trim(), 25)
        .then((payload) => {
          if (cancelled) {
            return
          }

          setSuggestions(payload.items ?? [])
          setError(null)
        })
        .catch((fetchError) => {
          if (cancelled) {
            return
          }

          const message =
            fetchError instanceof Error
              ? fetchError.message
              : 'Errore caricamento campi Salesforce'
          setSuggestions([])
          setError(message)
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false)
          }
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [canLoadSuggestions, normalizedObjectApiName, searchInput])

  const addField = (fieldName: string) => {
    if (selectedSet.has(fieldName)) {
      return
    }

    onChange([...value, fieldName])
    setSearchInput('')
  }

  const removeField = (fieldName: string) => {
    onChange(value.filter((entry) => entry !== fieldName))
  }

  const clearAll = () => {
    onChange([])
    setSearchInput('')
  }
  const shouldShowDropdown = isOpen && normalizedObjectApiName.length > 0
  const dropdownLoading = shouldShowDropdown ? loading : false
  const dropdownError = shouldShowDropdown ? error : null
  const dropdownSuggestions = shouldShowDropdown ? selectableSuggestions : []

  return (
    <div>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="mt-2 rounded-xl border border-slate-300 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-2 shadow-sm">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {value.length} selezionati
          </p>
          {value.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            inputRef.current?.focus()
            if (normalizedObjectApiName.length > 0) {
              setIsOpen(true)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              inputRef.current?.focus()
              if (normalizedObjectApiName.length > 0) {
                setIsOpen(true)
              }
            }
          }}
          className="mt-2 rounded-lg border border-slate-200 bg-white p-2 transition hover:border-slate-300"
        >
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {value.length > 0 ? (
              value.map((fieldName) => (
                <span
                  key={fieldName}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-900"
                >
                  {fieldName}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeField(fieldName)
                    }}
                    className="rounded px-1 text-sky-500 transition hover:bg-sky-100 hover:text-sky-700"
                    aria-label={`Rimuovi ${fieldName}`}
                  >
                    x
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">Nessun campo selezionato</span>
            )}
          </div>

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
                  if (event.key === 'Enter') {
                    const firstSuggestion = selectableSuggestions[0]
                    if (firstSuggestion) {
                      event.preventDefault()
                      addField(firstSuggestion.name)
                    }
                  }
                }}
                disabled={normalizedObjectApiName.length === 0}
                placeholder={
                  normalizedObjectApiName.length === 0
                    ? 'Imposta prima Object API Name in Base'
                    : (placeholder ?? 'Cerca campi Salesforce...')
                }
                className="block w-full border-0 bg-transparent p-0 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
              />
            </div>

            {shouldShowDropdown ? (
              <div className="absolute left-0 top-full z-20 w-full overflow-hidden rounded-b-xl border border-slate-300 border-t-0 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.14)]">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {dropdownLoading
                      ? 'Ricerca in corso...'
                      : `${dropdownSuggestions.length} campi disponibili`}
                  </p>
                </div>

                <div className="max-h-72 overflow-auto p-1.5">
                  {dropdownLoading ? (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      Ricerca campi Salesforce...
                    </p>
                  ) : null}

                  {!dropdownLoading && dropdownError ? (
                    <p className="px-3 py-2 text-xs text-rose-600">{dropdownError}</p>
                  ) : null}

                  {!dropdownLoading && !dropdownError && dropdownSuggestions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      Nessun campo disponibile
                    </p>
                  ) : null}

                  {!dropdownLoading && !dropdownError && dropdownSuggestions.length > 0
                    ? dropdownSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.name}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => addField(suggestion.name)}
                          className="group flex w-full items-start justify-between rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {suggestion.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {suggestion.label}
                            </p>
                          </div>
                          <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                              {suggestion.type}
                            </span>
                            {suggestion.filterable ? (
                              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                                filterable
                              </span>
                            ) : null}
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

      {helperText ? (
        <p className="mt-1 text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  )
}
