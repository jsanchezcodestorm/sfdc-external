import type { AvailableApp } from '../app-types'

type AvailableAppsLauncherProps = {
  apps: AvailableApp[]
  selectedAppId: string | null
  loading: boolean
  error: string | null
  onSelectApp: (appId: string) => void
}

export function AvailableAppsLauncher({
  apps,
  selectedAppId,
  loading,
  error,
  onSelectApp,
}: AvailableAppsLauncherProps) {
  if (error) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </p>
    )
  }

  if (loading) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Caricamento app disponibili...
      </p>
    )
  }

  if (apps.length === 0) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Nessuna app disponibile per i permessi correnti.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {apps.map((app) => {
        const isSelected = app.id === selectedAppId

        return (
          <button
            key={app.id}
            type="button"
            onClick={() => onSelectApp(app.id)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
              isSelected
                ? 'border-sky-400 bg-sky-50 shadow-[0_18px_40px_-30px_rgba(2,132,199,0.9)]'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{app.label}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                  {app.description?.trim() || 'Nessuna descrizione configurata.'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  isSelected ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {app.items.length}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
