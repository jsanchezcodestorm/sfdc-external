import { useEffect, useMemo, useState } from 'react'

import {
  fetchAclDefaultPermissions,
  updateAclDefaultPermissions,
} from '../acl-admin-api'
import type { AclAdminDefaultPermissionItem } from '../acl-admin-types'

export function AclDefaultsPage() {
  const [items, setItems] = useState<AclAdminDefaultPermissionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void fetchAclDefaultPermissions()
      .then((payload) => {
        if (cancelled) {
          return
        }

        setItems(payload.items ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento default permissions'
        setPageError(message)
        setItems([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const enabledCodes = useMemo(
    () => items.filter((item) => item.enabled).map((item) => item.permissionCode),
    [items],
  )

  const saveDefaults = async () => {
    setSaving(true)
    setPageError(null)
    setSaveInfo(null)

    try {
      const payload = await updateAclDefaultPermissions(enabledCodes)
      setItems(payload.items ?? [])
      setSaveInfo('Default permissions salvate')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore salvataggio default permissions'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Checklist
            </p>
            <h2 className="text-xl font-semibold text-slate-900">Default Permissions</h2>
            <p className="mt-1 text-sm text-slate-600">
              Salvataggio dedicato della collection defaults senza passare dallo snapshot ACL.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void saveDefaults()
            }}
            disabled={loading || saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva defaults'}
          </button>
        </div>

        {pageError ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {pageError}
          </p>
        ) : null}

        {saveInfo ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {saveInfo}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Caricamento default permissions...</p>
        ) : items.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">
            Nessun permission code disponibile.
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {items.map((item) => (
              <label
                key={item.permissionCode}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
              >
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.permissionCode === item.permissionCode
                          ? { ...entry, enabled: event.target.checked }
                          : entry,
                      ),
                    )
                  }
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{item.permissionCode}</p>
                  {item.label ? <p className="mt-1 text-sm text-slate-600">{item.label}</p> : null}
                  {item.description ? (
                    <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
        )}
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Summary
        </p>
        <h2 className="text-xl font-semibold text-slate-900">Defaults attivi</h2>
        <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          {enabledCodes.length}
        </p>

        <div className="mt-5 space-y-2">
          {enabledCodes.length > 0 ? (
            enabledCodes.map((permissionCode) => (
              <div
                key={permissionCode}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
              >
                {permissionCode}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Nessun default configurato.</p>
          )}
        </div>
      </aside>
    </section>
  )
}
