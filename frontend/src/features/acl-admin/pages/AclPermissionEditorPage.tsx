import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  createAclPermission,
  fetchAclPermission,
  fetchAclPermissions,
  updateAclPermission,
} from '../acl-admin-api'
import type { AclAdminPermissionSummary, AclPermissionDefinition } from '../acl-admin-types'
import { fetchAppAdminList } from '../../apps-admin/apps-admin-api'
import type { AppAdminSummary } from '../../apps-admin/apps-admin-types'
import { createEmptyPermission, normalizePermission } from '../acl-admin-utils'

type AclPermissionEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  permissionCode?: string
}

export function AclPermissionEditorPage({ mode }: AclPermissionEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const previousCode = params.permissionCode ? decodeURIComponent(params.permissionCode) : null
  const [draft, setDraft] = useState<AclPermissionDefinition>(createEmptyPermission())
  const [apps, setApps] = useState<AppAdminSummary[]>([])
  const [permissions, setPermissions] = useState<AclAdminPermissionSummary[]>([])
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([])
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'edit' || !previousCode) {
      setDraft(createEmptyPermission())
      setSelectedAppIds([])
    }

    let cancelled = false
    setLoading(true)

    const loadPromise =
      mode === 'edit' && previousCode
        ? Promise.all([fetchAclPermissions(), fetchAppAdminList(), fetchAclPermission(previousCode)])
        : Promise.all([fetchAclPermissions(), fetchAppAdminList(), Promise.resolve(null)])

    void loadPromise
      .then(([permissionsPayload, appsPayload, permissionPayload]) => {
        if (cancelled) {
          return
        }

        setPermissions(permissionsPayload.items ?? [])
        setApps(appsPayload.items ?? [])
        setDraft(permissionPayload?.permission ?? createEmptyPermission())
        setSelectedAppIds(permissionPayload?.appIds ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento permission'
        setPageError(message)
        setApps([])
        setPermissions([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mode, previousCode])

  const toggleApp = (appId: string) => {
    setSelectedAppIds((current) =>
      current.includes(appId)
        ? current.filter((entry) => entry !== appId)
        : [...current, appId],
    )
  }

  const savePermission = async () => {
    const normalized = normalizePermission(draft)

    if (!normalized.code) {
      setPageError('Il permission code è obbligatorio')
      return
    }

    if (isDuplicateCode) {
      setPageError('Esiste gia una permission con questo code')
      return
    }

    setSaving(true)
    setPageError(null)

    try {
      const payload =
        mode === 'create'
          ? await createAclPermission(normalized, selectedAppIds)
          : await updateAclPermission(previousCode ?? normalized.code, normalized, selectedAppIds)

      navigate(`/admin/acl/permissions/${encodeURIComponent(payload.permission.code)}`, {
        replace: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore salvataggio permission'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const selectedAppSet = new Set(selectedAppIds)
  const isDuplicateCode =
    draft.code.trim().length > 0 &&
    permissions.some(
      (permission) =>
        permission.code.toLowerCase() === draft.code.trim().toLowerCase() &&
        permission.code !== previousCode,
    )

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {mode === 'create' ? 'Create' : 'Edit'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {mode === 'create' ? 'Nuovo permesso' : previousCode || 'Permission'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              navigate(
                mode === 'create'
                  ? '/admin/acl/permissions'
                  : `/admin/acl/permissions/${encodeURIComponent(previousCode ?? draft.code)}`,
              )
            }
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => {
              void savePermission()
            }}
            disabled={loading || saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva permission'}
          </button>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento permission...</p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Permission code
              <input
                type="text"
                value={draft.code}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, code: event.target.value }))
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
              {isDuplicateCode ? (
                <p className="mt-2 text-xs text-rose-700">
                  Esiste gia una permission con questo code.
                </p>
              ) : null}
            </label>

            <label className="text-sm font-medium text-slate-700">
              Label
              <input
                type="text"
                value={draft.label ?? ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, label: event.target.value }))
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Description
            <textarea
              value={draft.description ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">Aliases</p>
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    aliases: [...(current.aliases ?? []), ''],
                  }))
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              >
                Aggiungi alias
              </button>
            </div>

            {(draft.aliases ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Nessun alias configurato.</p>
            ) : null}

            {(draft.aliases ?? []).map((alias, index) => (
              <div key={`alias-${index}`} className="flex gap-2">
                <input
                  type="text"
                  value={alias}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      aliases: (current.aliases ?? []).map((entry, currentIndex) =>
                        currentIndex === index ? event.target.value : entry,
                      ),
                    }))
                  }
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      aliases: (current.aliases ?? []).filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    }))
                  }
                  className="rounded-md border border-rose-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
                >
                  Rimuovi
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">App disponibili</p>
                <p className="mt-1 text-xs text-slate-500">
                  Seleziona le app rese disponibili agli utenti che ricevono questo permesso.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                {selectedAppIds.length} selezionate
              </p>
            </div>

            {apps.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Nessuna app configurata. Crea prima almeno una app nel catalogo admin.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {apps.map((app) => (
                  <label
                    key={app.id}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAppSet.has(app.id)}
                      onChange={() => toggleApp(app.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-sky-500"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{app.label}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{app.id}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {app.entityCount} entity associate
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
