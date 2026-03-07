import { useEffect, useState } from 'react'

import { searchEntityAdminObjectApiNames } from '../../entity-admin-api'
import type { SalesforceObjectApiNameSuggestion } from '../../entity-admin-types'

type ObjectApiNameQuickFindProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function ObjectApiNameQuickFind({
  value,
  onChange,
  placeholder,
}: ObjectApiNameQuickFindProps) {
  const [suggestions, setSuggestions] = useState<SalesforceObjectApiNameSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const searchValue = value.trim()
  const shouldLoadSuggestions = isOpen && searchValue.length >= 2
  const showSuggestions =
    shouldLoadSuggestions && (loading || suggestions.length > 0 || error !== null)

  useEffect(() => {
    if (!shouldLoadSuggestions) {
      return
    }

    let cancelled = false

    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchEntityAdminObjectApiNames(searchValue, 8)
        .then((payload) => {
          if (cancelled) {
            return
          }

          setSuggestions(payload.items ?? [])
        })
        .catch((searchError) => {
          if (cancelled) {
            return
          }

          const message =
            searchError instanceof Error
              ? searchError.message
              : 'Errore ricerca object Salesforce'
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
  }, [searchValue, shouldLoadSuggestions])

  return (
    <div className="relative mt-2">
      <input
        type="text"
        value={value}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120)
        }}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />

      {showSuggestions ? (
        <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-500">Ricerca object Salesforce...</p>
          ) : null}

          {!loading && error ? (
            <p className="px-3 py-2 text-xs text-rose-600">{error}</p>
          ) : null}

          {!loading && !error && suggestions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">Nessun risultato</p>
          ) : null}

          {!loading && !error && suggestions.length > 0
            ? suggestions.map((suggestion) => (
                <button
                  key={suggestion.name}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(suggestion.name)
                    setIsOpen(false)
                  }}
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
  )
}
