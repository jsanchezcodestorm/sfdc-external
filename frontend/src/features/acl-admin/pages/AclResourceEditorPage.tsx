import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { AclResourceStatusNotice } from '../../../components/AclResourceStatusNotice'
import {
  formatAclResourceManagedBy,
  formatAclResourceSyncState,
} from '../../../lib/acl-resource-status'
import {
  createAclResource,
  fetchAclPermissions,
  fetchAclResource,
  updateAclResource,
} from '../acl-admin-api'
import type { AclResourceConfig } from '../acl-admin-types'
import { ACL_RESOURCE_TYPE_OPTIONS, createEmptyResource, normalizeResource } from '../acl-admin-utils'

type AclResourceEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  resourceId?: string
}

export function AclResourceEditorPage({ mode }: AclResourceEditorPageProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const previousId = params.resourceId ? decodeURIComponent(params.resourceId) : null
  const [draft, setDraft] = useState<AclResourceConfig>(createEmptyResource())
  const [permissionCodes, setPermissionCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const isSystemResource = mode === 'edit' && draft.managedBy === 'system'

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const load = async () => {
      const permissionsResponse = await fetchAclPermissions()
      const nextPermissionCodes = permissionsResponse.items.map((item) => item.code)

      if (mode === 'edit' && previousId) {
        const resourceResponse = await fetchAclResource(previousId)

        if (cancelled) {
          return
        }

        setDraft(resourceResponse.resource)
        setPermissionCodes(nextPermissionCodes)
        setPageError(null)
        setLoading(false)
        return
      }

      if (cancelled) {
        return
      }

      setDraft(createEmptyResource())
      setPermissionCodes(nextPermissionCodes)
      setPageError(null)
      setLoading(false)
    }

    void load().catch((error) => {
      if (cancelled) {
        return
      }

      const message = error instanceof Error ? error.message : 'Errore caricamento resource'
      setPageError(message)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [mode, previousId])

  useEffect(() => {
    if (loading) {
      return
    }

    const anchorId = location.hash.replace(/^#/, '').trim()
    if (!anchorId) {
      return
    }

    const node = document.getElementById(anchorId)
    if (!node) {
      return
    }

    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [loading, location.hash])

  const saveResource = async () => {
    const normalized = normalizeResource(draft)

    if (!normalized.id) {
      setPageError('Il resource id è obbligatorio')
      return
    }

    setSaving(true)
    setPageError(null)

    try {
      const payload =
        mode === 'create'
          ? await createAclResource(normalized)
          : await updateAclResource(previousId ?? normalized.id, normalized)

      navigate(`/admin/acl/resources/${encodeURIComponent(payload.resource.id)}`, {
        replace: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore salvataggio resource'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {mode === 'create' ? 'Create' : 'Edit'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {mode === 'create' ? 'Nuova risorsa' : previousId || 'Resource'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              navigate(
                mode === 'create'
                  ? '/admin/acl/resources'
                  : `/admin/acl/resources/${encodeURIComponent(previousId ?? draft.id)}`,
              )
            }
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => {
              void saveResource()
            }}
            disabled={loading || saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva risorsa'}
          </button>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento resource...</p>
      ) : (
        <div className="mt-5 space-y-5">
          {mode === 'edit' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              <AclResourceStatusNotice
                status={draft}
                permissionCount={draft.permissions.length}
                className=""
              />
              <p className="mt-1">
                Managed by {formatAclResourceManagedBy(draft.managedBy)} /{' '}
                {formatAclResourceSyncState(draft.syncState)}
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Resource id
              <input
                type="text"
                value={draft.id}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, id: event.target.value }))
                }
                disabled={isSystemResource}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Type
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value as AclResourceConfig['type'],
                  }))
                }
                disabled={isSystemResource}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                {ACL_RESOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Access mode
            <select
              value={draft.accessMode}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  accessMode: event.target.value as AclResourceConfig['accessMode'],
                }))
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="disabled">Disabled</option>
              <option value="authenticated">Authenticated</option>
              <option value="permission-bound">Permission-bound</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Target
            <input
              type="text"
              value={draft.target ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, target: event.target.value }))
              }
              disabled={isSystemResource}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Description
            <textarea
              value={draft.description ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              disabled={isSystemResource}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>

          <div id="resource-permissions" className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Permissions</p>
              <p className="mt-1 text-xs text-slate-500">
                Seleziona i permission code autorizzati ad accedere alla risorsa.
              </p>
            </div>

            {permissionCodes.length === 0 ? (
              <p className="text-sm text-slate-500">Nessun permission code disponibile.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {permissionCodes.map((permissionCode) => (
                  <label
                    key={permissionCode}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={draft.permissions.includes(permissionCode)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          permissions: event.target.checked
                            ? [...current.permissions, permissionCode]
                            : current.permissions.filter((code) => code !== permissionCode),
                        }))
                      }
                    />
                    <span>{permissionCode}</span>
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
