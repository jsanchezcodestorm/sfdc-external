import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { fetchAclPermissions } from '../../acl-admin/acl-admin-api'
import type { AclAdminPermissionSummary } from '../../acl-admin/acl-admin-types'
import { fetchEntityAdminConfigList } from '../../entities-admin/entity-admin-api'
import type { EntityAdminConfigSummary } from '../../entities-admin/entity-admin-types'
import {
  deleteAppAdmin,
  fetchAppAdmin,
} from '../apps-admin-api'
import type { AppConfig } from '../apps-admin-types'
import {
  buildAppsAdminEditPath,
  buildAppsAdminListPath,
} from '../apps-admin-utils'

type RouteParams = {
  appId?: string
}

export function AppsAdminDetailPage() {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const appId = params.appId ? decodeURIComponent(params.appId) : null
  const [app, setApp] = useState<AppConfig | null>(null)
  const [entities, setEntities] = useState<EntityAdminConfigSummary[]>([])
  const [permissions, setPermissions] = useState<AclAdminPermissionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!appId) {
      setLoading(false)
      setPageError('App ID mancante')
      return
    }

    let cancelled = false
    setLoading(true)

    void Promise.all([fetchAppAdmin(appId), fetchEntityAdminConfigList(), fetchAclPermissions()])
      .then(([appPayload, entitiesPayload, permissionsPayload]) => {
        if (cancelled) {
          return
        }

        setApp(appPayload.app)
        setEntities(entitiesPayload.items ?? [])
        setPermissions(permissionsPayload.items ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento app'
        setApp(null)
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
  }, [appId])

  const selectedEntities = useMemo(() => {
    const entitiesById = new Map(entities.map((entity) => [entity.id, entity]))
    return (app?.entityIds ?? []).map((entityId) => entitiesById.get(entityId)).filter(Boolean) as EntityAdminConfigSummary[]
  }, [app?.entityIds, entities])

  const selectedPermissions = useMemo(() => {
    const permissionsByCode = new Map(permissions.map((permission) => [permission.code, permission]))
    return (app?.permissionCodes ?? [])
      .map((permissionCode) => permissionsByCode.get(permissionCode))
      .filter(Boolean) as AclAdminPermissionSummary[]
  }, [app?.permissionCodes, permissions])

  const removeApp = async () => {
    if (!appId || !window.confirm(`Eliminare l'app ${appId}?`)) {
      return
    }

    setDeleting(true)
    setPageError(null)

    try {
      await deleteAppAdmin(appId)
      navigate(buildAppsAdminListPath(), { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore eliminazione app'
      setPageError(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            View
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{appId || 'App'}</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(buildAppsAdminListPath())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista app
          </button>
          {appId ? (
            <button
              type="button"
              onClick={() => navigate(buildAppsAdminEditPath(appId))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Modifica
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void removeApp()
            }}
            disabled={!appId || deleting}
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {deleting ? 'Eliminazione...' : 'Elimina'}
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
      ) : app ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailMetric label="Sort order" value={String(app.sortOrder)} />
            <DetailMetric label="Entity" value={String(app.entityIds.length)} />
            <DetailMetric label="Permissions" value={String(app.permissionCodes.length)} />
          </div>

          <DetailBlock label="Label">{app.label}</DetailBlock>
          <DetailBlock label="Description">{app.description || '-'}</DetailBlock>
          <DetailBlock label="Entity IDs">
            {app.entityIds.length > 0 ? app.entityIds.join(', ') : '-'}
          </DetailBlock>
          <DetailBlock label="Permission codes">
            {app.permissionCodes.length > 0 ? app.permissionCodes.join(', ') : '-'}
          </DetailBlock>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Entity associate</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedEntities.length > 0 ? (
                selectedEntities.map((entity) => (
                  <span
                    key={entity.id}
                    className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800"
                  >
                    {entity.label} ({entity.id})
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-600">Nessuna entity associata.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Permessi associati
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedPermissions.length > 0 ? (
                selectedPermissions.map((permission) => (
                  <span
                    key={permission.code}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                  >
                    {permission.label || permission.code} ({permission.code})
                  </span>
                ))
              ) : app.permissionCodes.length > 0 ? (
                app.permissionCodes.map((permissionCode) => (
                  <span
                    key={permissionCode}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                  >
                    {permissionCode}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-600">Nessuna permission associata.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </article>
  )
}

function DetailBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm text-slate-700">{children}</p>
    </div>
  )
}
