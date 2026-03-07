import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { fetchAclPermissions } from '../../acl-admin/acl-admin-api'
import type { AclAdminPermissionSummary } from '../../acl-admin/acl-admin-types'
import { fetchEntityAdminConfigList } from '../../entities-admin/entity-admin-api'
import type { EntityAdminConfigSummary } from '../../entities-admin/entity-admin-types'
import {
  createAppAdmin,
  fetchAppAdmin,
  updateAppAdmin,
} from '../apps-admin-api'
import type { AppConfig } from '../apps-admin-types'
import {
  buildAppsAdminListPath,
  buildAppsAdminViewPath,
  createAppConfigDraft,
  createEmptyAppConfigDraft,
  parseAppConfigDraft,
  type AppConfigDraft,
} from '../apps-admin-utils'

type AppsAdminEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  appId?: string
}

export function AppsAdminEditorPage({ mode }: AppsAdminEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const previousAppId = params.appId ? decodeURIComponent(params.appId) : null
  const [draft, setDraft] = useState<AppConfigDraft>(createEmptyAppConfigDraft())
  const [entities, setEntities] = useState<EntityAdminConfigSummary[]>([])
  const [permissions, setPermissions] = useState<AclAdminPermissionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const loadPromise =
      mode === 'edit' && previousAppId
        ? Promise.all([fetchEntityAdminConfigList(), fetchAclPermissions(), fetchAppAdmin(previousAppId)])
        : Promise.all([fetchEntityAdminConfigList(), fetchAclPermissions(), Promise.resolve(null)])

    void loadPromise
      .then(([entitiesPayload, permissionsPayload, appPayload]) => {
        if (cancelled) {
          return
        }

        setEntities(entitiesPayload.items ?? [])
        setPermissions(permissionsPayload.items ?? [])
        setDraft(appPayload ? createAppConfigDraft(appPayload.app) : createEmptyAppConfigDraft())
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento app'
        setEntities([])
        setPermissions([])
        setPageError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mode, previousAppId])

  const selectedEntityIds = useMemo(() => new Set(draft.entityIds), [draft.entityIds])
  const selectedPermissionCodes = useMemo(
    () => new Set(draft.permissionCodes),
    [draft.permissionCodes],
  )

  const toggleEntity = (entityId: string) => {
    setDraft((current) => ({
      ...current,
      entityIds: current.entityIds.includes(entityId)
        ? current.entityIds.filter((entry) => entry !== entityId)
        : [...current.entityIds, entityId],
    }))
  }

  const togglePermission = (permissionCode: string) => {
    setDraft((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(permissionCode)
        ? current.permissionCodes.filter((entry) => entry !== permissionCode)
        : [...current.permissionCodes, permissionCode],
    }))
  }

  const saveApp = async () => {
    let parsedApp: AppConfig

    try {
      parsedApp = parseAppConfigDraft(draft)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'App non valida')
      return
    }

    setSaving(true)
    setPageError(null)

    try {
      const payload =
        mode === 'create'
          ? await createAppAdmin(parsedApp)
          : await updateAppAdmin(previousAppId ?? parsedApp.id, parsedApp)

      navigate(buildAppsAdminViewPath(payload.app.id), { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore salvataggio app'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const cancelTarget =
    mode === 'create' ? buildAppsAdminListPath() : buildAppsAdminViewPath(previousAppId ?? draft.id)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {mode === 'create' ? 'Create' : 'Edit'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {mode === 'create' ? 'Nuova app' : previousAppId || 'App'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(cancelTarget)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => {
              void saveApp()
            }}
            disabled={loading || saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva app'}
          </button>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento app...</p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              App ID
              <input
                type="text"
                value={draft.id}
                disabled={mode === 'edit'}
                onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Label
              <input
                type="text"
                value={draft.label}
                onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="text-sm font-medium text-slate-700">
              Description
              <textarea
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Sort order
              <input
                type="number"
                min={0}
                step={1}
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, sortOrder: event.target.value }))
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Entity associate</p>
                <p className="mt-1 text-xs text-slate-500">
                  Le entity selezionate vengono mostrate nella launcher home dell&apos;app.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                {draft.entityIds.length} selezionate
              </p>
            </div>

            {entities.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Nessuna entity configurata. Crea prima almeno una entity config.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {entities.map((entity) => (
                  <label
                    key={entity.id}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEntityIds.has(entity.id)}
                      onChange={() => toggleEntity(entity.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-sky-500"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{entity.label}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {entity.id} · {entity.objectApiName}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Permessi associati</p>
                <p className="mt-1 text-xs text-slate-500">
                  Seleziona i permessi che rendono disponibile questa app agli utenti.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                {draft.permissionCodes.length} selezionati
              </p>
            </div>

            {permissions.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Nessuna permission configurata. Crea prima almeno una ACL permission.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {permissions.map((permission) => (
                  <label
                    key={permission.code}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPermissionCodes.has(permission.code)}
                      onChange={() => togglePermission(permission.code)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-sky-500"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">
                        {permission.label || permission.code}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">{permission.code}</span>
                      {permission.description ? (
                        <span className="mt-1 block text-xs text-slate-500">
                          {permission.description}
                        </span>
                      ) : null}
                    </span>
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
