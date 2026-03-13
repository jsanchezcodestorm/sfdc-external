import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  formatAclResourceAccessMode,
  formatAclResourceManagedBy,
  formatAclResourceSyncState,
} from '../../../lib/acl-resource-status'
import {
  createAclPermission,
  fetchAclPermission,
  fetchAclPermissions,
  fetchAclResources,
  updateAclPermission,
} from '../acl-admin-api'
import type {
  AclAdminPermissionSummary,
  AclAdminResourceSummary,
  AclPermissionDefinition,
  AclResourceType,
} from '../acl-admin-types'
import { fetchAppAdminList } from '../../apps-admin/apps-admin-api'
import type { AppAdminSummary } from '../../apps-admin/apps-admin-types'
import {
  ACL_RESOURCE_TYPE_OPTIONS,
  createEmptyPermission,
  normalizePermission,
} from '../acl-admin-utils'

type AclPermissionEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  permissionCode?: string
}

type ResourceFilter = 'all' | AclResourceType

export function AclPermissionEditorPage({ mode }: AclPermissionEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const previousCode = params.permissionCode ? decodeURIComponent(params.permissionCode) : null
  const [draft, setDraft] = useState<AclPermissionDefinition>(createEmptyPermission())
  const [apps, setApps] = useState<AppAdminSummary[]>([])
  const [permissions, setPermissions] = useState<AclAdminPermissionSummary[]>([])
  const [resources, setResources] = useState<AclAdminResourceSummary[]>([])
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([])
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([])
  const [resourceQuery, setResourceQuery] = useState('')
  const [resourceTypeFilter, setResourceTypeFilter] = useState<ResourceFilter>('all')
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'edit' || !previousCode) {
      setDraft(createEmptyPermission())
      setSelectedAppIds([])
      setSelectedResourceIds([])
    }

    let cancelled = false
    setLoading(true)

    const loadPromise =
      mode === 'edit' && previousCode
        ? Promise.all([
            fetchAclPermissions(),
            fetchAppAdminList(),
            fetchAclResources(),
            fetchAclPermission(previousCode),
          ])
        : Promise.all([
            fetchAclPermissions(),
            fetchAppAdminList(),
            fetchAclResources(),
            Promise.resolve(null),
          ])

    void loadPromise
      .then(([permissionsPayload, appsPayload, resourcesPayload, permissionPayload]) => {
        if (cancelled) {
          return
        }

        setPermissions(permissionsPayload.items ?? [])
        setApps(appsPayload.items ?? [])
        setResources(resourcesPayload.items ?? [])
        setDraft(permissionPayload?.permission ?? createEmptyPermission())
        setSelectedAppIds(permissionPayload?.appIds ?? [])
        setSelectedResourceIds(permissionPayload?.resources.map((resource) => resource.id) ?? [])
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
        setResources([])
        setSelectedAppIds([])
        setSelectedResourceIds([])
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

  const toggleResource = (resourceId: string) => {
    setSelectedResourceIds((current) =>
      current.includes(resourceId)
        ? current.filter((entry) => entry !== resourceId)
        : [...current, resourceId],
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
          ? await createAclPermission(normalized, selectedAppIds, selectedResourceIds)
          : await updateAclPermission(
              previousCode ?? normalized.code,
              normalized,
              selectedAppIds,
              selectedResourceIds,
            )

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

  const selectedAppSet = useMemo(() => new Set(selectedAppIds), [selectedAppIds])
  const selectedResourceSet = useMemo(() => new Set(selectedResourceIds), [selectedResourceIds])
  const isDuplicateCode =
    draft.code.trim().length > 0 &&
    permissions.some(
      (permission) =>
        permission.code.toLowerCase() === draft.code.trim().toLowerCase() &&
        permission.code !== previousCode,
    )
  const filteredResources = useMemo(() => {
    const normalizedQuery = resourceQuery.trim().toLowerCase()

    return resources.filter((resource) => {
      const matchesType = resourceTypeFilter === 'all' ? true : resource.type === resourceTypeFilter
      if (!matchesType) {
        return false
      }

      if (normalizedQuery.length === 0) {
        return true
      }

      return [resource.id, resource.target ?? '', resource.description ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [resourceQuery, resourceTypeFilter, resources])

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
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Associated resources</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Seleziona le risorse ACL a cui questo permesso deve essere associato.
                  </p>
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {selectedResourceIds.length} selezionate
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Filtro testo
                  <input
                    type="search"
                    value={resourceQuery}
                    onChange={(event) => setResourceQuery(event.target.value)}
                    placeholder="Cerca per id, target o descrizione"
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Type
                  <select
                    value={resourceTypeFilter}
                    onChange={(event) => setResourceTypeFilter(event.target.value as ResourceFilter)}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="all">Tutti</option>
                    {ACL_RESOURCE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {resources.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Nessuna risorsa configurata. Crea prima almeno una ACL resource.
              </p>
            ) : filteredResources.length === 0 ? (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Nessuna risorsa corrisponde ai filtri correnti.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {filteredResources.map((resource) => (
                  <label
                    key={resource.id}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                      selectedResourceSet.has(resource.id)
                        ? 'border-slate-300 bg-slate-100'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedResourceSet.has(resource.id)}
                      onChange={() => toggleResource(resource.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-sky-500"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-all font-semibold text-slate-950">{resource.id}</p>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {resource.type}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {formatAclResourceAccessMode(resource.accessMode)}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {formatAclResourceSyncState(resource.syncState)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        {resource.target ? `Target: ${resource.target}` : 'Target non configurato'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatAclResourceManagedBy(resource.managedBy)}
                      </p>
                      {resource.description ? (
                        <p className="mt-1 text-xs text-slate-500">{resource.description}</p>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            )}
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
                        {app.itemCount} item, {app.entityCount} entity
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
