import { useEffect, useState } from 'react'

import { searchEntityAdminObjectFields } from '../entity-admin-api'
import type { SalesforceObjectFieldSuggestion } from '../entity-admin-types'

type SalesforceFieldSingleInputProps = {
  label: string
  objectApiName: string
  value: string
  placeholder?: string
  helperText?: string
  onChange: (value: string) => void
}

export function SalesforceFieldSingleInput({
  label,
  objectApiName,
  value,
  placeholder,
  helperText,
  onChange,
}: SalesforceFieldSingleInputProps) {
  const [suggestions, setSuggestions] = useState<SalesforceObjectFieldSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const normalizedObjectApiName = objectApiName.trim()
  const searchValue = value.trim()
  const shouldLoadSuggestions = isOpen && normalizedObjectApiName.length > 0

  useEffect(() => {
    if (!shouldLoadSuggestions) {
      return
    }

    let cancelled = false

    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchEntityAdminObjectFields(normalizedObjectApiName, searchValue, 12)
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
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [normalizedObjectApiName, searchValue, shouldLoadSuggestions])

  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <div className="relative mt-1">
        <input
          type="text"
          value={value}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120)
          }}
          onChange={(event) => onChange(event.target.value)}
          disabled={normalizedObjectApiName.length === 0}
          placeholder={
            normalizedObjectApiName.length === 0
              ? 'Imposta prima Object API Name in Base'
              : (placeholder ?? 'Cerca o inserisci un campo Salesforce')
          }
          className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        />

        {isOpen && normalizedObjectApiName.length > 0 ? (
          <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.14)]">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {loading ? 'Ricerca in corso...' : `${suggestions.length} suggerimenti`}
              </p>
            </div>

            <div className="max-h-64 overflow-auto p-1.5">
              {loading ? (
                <p className="px-3 py-2 text-xs text-slate-500">Ricerca campi Salesforce...</p>
              ) : null}

              {!loading && error ? (
                <p className="px-3 py-2 text-xs text-rose-600">{error}</p>
              ) : null}

              {!loading && !error && suggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500">
                  Nessun suggerimento. Puoi inserire manualmente anche path relazionali.
                </p>
              ) : null}

              {!loading && !error
                ? suggestions.map((suggestion) => (
                    <button
                      key={suggestion.name}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onChange(suggestion.name)
                        setIsOpen(false)
                      }}
                      className="group flex w-full items-start justify-between rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{suggestion.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{suggestion.label}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {suggestion.type}
                      </span>
                    </button>
                  ))
                : null}
            </div>
          </div>
        ) : null}
      </div>

      {helperText ? <p className="mt-1 text-[11px] text-slate-500">{helperText}</p> : null}
    </label>
  )
}
