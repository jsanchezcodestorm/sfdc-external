import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { fetchAclPermissions, fetchAclResources } from '../../acl-admin/acl-admin-api'
import type {
  AclAdminPermissionSummary,
  AclAdminResourceSummary,
} from '../../acl-admin/acl-admin-types'
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
  createEmptyAppItemDraft,
  parseAppConfigDraft,
  type AppConfigDraft,
  type AppItemDraft,
} from '../apps-admin-utils'

type AppsAdminEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  appId?: string
}

const ITEM_KIND_OPTIONS = [
  { kind: 'home', label: 'Home' },
  { kind: 'entity', label: 'Entity' },
  { kind: 'custom-page', label: 'Custom Page' },
  { kind: 'external-link', label: 'External Link' },
  { kind: 'report', label: 'Report' },
  { kind: 'dashboard', label: 'Dashboard' },
] as const

type EditingAppItemState =
  | {
      mode: 'create'
      item: AppItemDraft
    }
  | {
      mode: 'edit'
      index: number
      item: AppItemDraft
    }

export function AppsAdminEditorPage({ mode }: AppsAdminEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const previousAppId = params.appId ? decodeURIComponent(params.appId) : null
  const [draft, setDraft] = useState<AppConfigDraft>(createEmptyAppConfigDraft())
  const [entities, setEntities] = useState<EntityAdminConfigSummary[]>([])
  const [permissions, setPermissions] = useState<AclAdminPermissionSummary[]>([])
  const [resources, setResources] = useState<AclAdminResourceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [editingItemState, setEditingItemState] = useState<EditingAppItemState | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const loadPromise =
      mode === 'edit' && previousAppId
        ? Promise.all([
            fetchEntityAdminConfigList(),
            fetchAclPermissions(),
            fetchAclResources(),
            fetchAppAdmin(previousAppId),
          ])
        : Promise.all([
            fetchEntityAdminConfigList(),
            fetchAclPermissions(),
            fetchAclResources(),
            Promise.resolve(null),
          ])

    void loadPromise
      .then(([entitiesPayload, permissionsPayload, resourcesPayload, appPayload]) => {
        if (cancelled) {
          return
        }

        setEntities(entitiesPayload.items ?? [])
        setPermissions(permissionsPayload.items ?? [])
        setResources(resourcesPayload.items ?? [])
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
        setResources([])
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

  const selectedPermissionCodes = useMemo(
    () => new Set(draft.permissionCodes),
    [draft.permissionCodes],
  )

  const togglePermission = (permissionCode: string) => {
    setDraft((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(permissionCode)
        ? current.permissionCodes.filter((entry) => entry !== permissionCode)
        : [...current.permissionCodes, permissionCode],
    }))
  }

  const updateItem = (index: number, nextItem: AppItemDraft) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? nextItem : item)),
    }))
  }

  const removeItem = (index: number) => {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.items.length) {
        return current
      }

      const nextItems = [...current.items]
      const [movedItem] = nextItems.splice(index, 1)
      nextItems.splice(nextIndex, 0, movedItem)

      return {
        ...current,
        items: nextItems,
      }
    })
  }

  const homeCount = useMemo(
    () => draft.items.filter((item) => item.kind === 'home').length,
    [draft.items],
  )

  const openCreateItemModal = (kind: AppItemDraft['kind']) => {
    setEditingItemState({
      mode: 'create',
      item: createEmptyAppItemDraft(kind),
    })
  }

  const openEditItemModal = (index: number) => {
    const item = draft.items[index]
    if (!item) {
      return
    }

    setEditingItemState({
      mode: 'edit',
      index,
      item,
    })
  }

  const closeItemModal = () => {
    setEditingItemState(null)
  }

  const saveItemModal = (nextItem: AppItemDraft) => {
    if (!editingItemState) {
      return
    }

    if (editingItemState.mode === 'create') {
      setDraft((current) => ({
        ...current,
        items: [...current.items, nextItem],
      }))
    } else {
      updateItem(editingItemState.index, nextItem)
    }

    setEditingItemState(null)
  }

  const canRemoveItem = (item: AppItemDraft) => item.kind !== 'home' || homeCount > 1

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">App Items</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ordina la navigazione dell&apos;app e configura home, entity, pagine, link esterni e moduli interni report/dashboard.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ITEM_KIND_OPTIONS.map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    onClick={() => openCreateItemModal(option.kind)}
                    disabled={option.kind === 'home' && homeCount > 0}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    + {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <AppItemsTable
                items={draft.items}
                onEdit={openEditItemModal}
                onMoveUp={(index) => moveItem(index, -1)}
                onMoveDown={(index) => moveItem(index, 1)}
                onRemove={removeItem}
                canRemoveItem={canRemoveItem}
              />
            </div>
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

      {editingItemState ? (
        <AppItemEditorModal
          key={
            editingItemState.mode === 'edit'
              ? `edit-${editingItemState.index}-${editingItemState.item.id}`
              : `create-${editingItemState.item.kind}`
          }
          mode={editingItemState.mode}
          index={editingItemState.mode === 'edit' ? editingItemState.index : null}
          item={editingItemState.item}
          entities={entities}
          resources={resources}
          onClose={closeItemModal}
          onSave={saveItemModal}
        />
      ) : null}
    </section>
  )
}

type AppItemsTableProps = {
  items: AppItemDraft[]
  onEdit: (index: number) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
  onRemove: (index: number) => void
  canRemoveItem: (item: AppItemDraft) => boolean
}

function AppItemsTable({
  items,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
  canRemoveItem,
}: AppItemsTableProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
        Nessun item configurato. Aggiungi almeno una home o un item navigabile.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-3 py-3 text-left">Ordine</th>
            <th className="px-3 py-3 text-left">Kind</th>
            <th className="px-3 py-3 text-left">Item</th>
            <th className="px-3 py-3 text-left">Target</th>
            <th className="px-3 py-3 text-left">Config</th>
            <th className="px-3 py-3 text-left">ACL</th>
            <th className="px-3 py-3 text-right">Azioni</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item, index) => (
            <tr key={`${item.id || item.kind}-${index}`} className="align-top">
              <td className="px-3 py-3 text-slate-500">{index + 1}</td>
              <td className="px-3 py-3">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700">
                  {formatItemKind(item.kind)}
                </span>
              </td>
              <td className="px-3 py-3">
                <p className="font-semibold text-slate-900">{item.label || 'Senza label'}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {item.id || 'item-id mancante'}
                </p>
                {item.description.trim() ? (
                  <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
                    {item.description.trim()}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-3 text-slate-700">{describeItemTarget(item)}</td>
              <td className="px-3 py-3 text-slate-700">{describeItemConfig(item)}</td>
              <td className="px-3 py-3 text-slate-700">
                {item.kind === 'home' ? '-' : item.resourceId.trim() || 'Nessuna'}
              </td>
              <td className="px-3 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onMoveUp(index)}
                    disabled={index === 0}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Su
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveDown(index)}
                    disabled={index === items.length - 1}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Giù
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(index)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    disabled={!canRemoveItem(item)}
                    className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Rimuovi
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type AppItemEditorModalProps = {
  mode: 'create' | 'edit'
  index: number | null
  item: AppItemDraft
  entities: EntityAdminConfigSummary[]
  resources: AclAdminResourceSummary[]
  onClose: () => void
  onSave: (item: AppItemDraft) => void
}

function AppItemEditorModal({
  mode,
  index,
  item,
  entities,
  resources,
  onClose,
  onSave,
}: AppItemEditorModalProps) {
  const [draft, setDraft] = useState<AppItemDraft>(() => item)
  const [error, setError] = useState<string | null>(null)

  const update = (patch: Partial<AppItemDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError(null)
  }

  const updateKind = (nextKind: AppItemDraft['kind']) => {
    setDraft((current) => ({
      ...current,
      kind: nextKind,
      id: nextKind === 'home' && current.id.trim().length === 0 ? 'home' : current.id,
      label: nextKind === 'home' && current.label.trim().length === 0 ? 'Home' : current.label,
      resourceId: nextKind === 'home' ? '' : current.resourceId,
    }))
    setError(null)
  }

  const save = () => {
    const normalizedId = draft.id.trim()
    const normalizedLabel = draft.label.trim()

    if (!normalizedId) {
      setError('Item ID obbligatorio')
      return
    }

    if (!normalizedLabel) {
      setError('Label obbligatoria')
      return
    }

    if (draft.kind === 'entity' && draft.entityId.trim().length === 0) {
      setError('Entity ID obbligatorio per item di tipo entity')
      return
    }

    if (draft.kind === 'external-link' && draft.url.trim().length === 0) {
      setError('URL obbligatoria per item external-link')
      return
    }

    if ((draft.kind === 'home' || draft.kind === 'custom-page') && draft.pageJson.trim().length > 0) {
      try {
        JSON.parse(draft.pageJson)
      } catch (parseError) {
        const message = parseError instanceof Error ? parseError.message : 'JSON non valido'
        setError(`Page JSON non valido (${message})`)
        return
      }
    }

    if (draft.height.trim().length > 0) {
      const parsedHeight = Number.parseInt(draft.height.trim(), 10)
      if (!Number.isInteger(parsedHeight) || parsedHeight <= 0) {
        setError('Height deve essere un intero > 0')
        return
      }
    }

    onSave({
      ...draft,
      id: normalizedId,
      label: normalizedLabel,
      description: draft.description,
      resourceId: draft.resourceId.trim(),
      entityId: draft.entityId.trim(),
      pageJson: draft.pageJson,
      url: draft.url.trim(),
      iframeTitle: draft.iframeTitle.trim(),
      height: draft.height.trim(),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {mode === 'create' ? 'Nuovo app item' : `Modifica item ${index !== null ? index + 1 : ''}`}
            </p>
            <h3 className="text-lg font-semibold text-slate-900">
              {draft.label || draft.id || 'Item editor'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">
                Kind
                <select
                  value={draft.kind}
                  onChange={(event) => updateKind(event.target.value as AppItemDraft['kind'])}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  {ITEM_KIND_OPTIONS.map((option) => (
                    <option key={option.kind} value={option.kind}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Item ID
                <input
                  type="text"
                  value={draft.id}
                  onChange={(event) => update({ id: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Label
                <input
                  type="text"
                  value={draft.label}
                  onChange={(event) => update({ label: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Description
                <textarea
                  value={draft.description}
                  onChange={(event) => update({ description: event.target.value })}
                  rows={3}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              {draft.kind !== 'home' ? (
                <label className="text-sm font-medium text-slate-700">
                  Resource ID
                  <input
                    list="app-item-editor-resources"
                    value={draft.resourceId}
                    onChange={(event) => update({ resourceId: event.target.value })}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                  <datalist id="app-item-editor-resources">
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.type}
                      </option>
                    ))}
                  </datalist>
                </label>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  La home non prevede `resourceId`.
                </div>
              )}
            </div>

            {draft.kind === 'entity' ? (
              <label className="block text-sm font-medium text-slate-700">
                Entity ID
                <select
                  value={draft.entityId}
                  onChange={(event) => update({ entityId: event.target.value })}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Seleziona entity</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.label} ({entity.id})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {(draft.kind === 'home' || draft.kind === 'custom-page') ? (
              <label className="block text-sm font-medium text-slate-700">
                Page JSON
                <textarea
                  value={draft.pageJson}
                  onChange={(event) => update({ pageJson: event.target.value })}
                  rows={14}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            ) : null}

            {draft.kind === 'external-link' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700 md:col-span-2">
                  URL
                  <input
                    type="url"
                    value={draft.url}
                    onChange={(event) => update({ url: event.target.value })}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Open mode
                  <select
                    value={draft.openMode}
                    onChange={(event) => update({ openMode: event.target.value as AppItemDraft['openMode'] })}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="new-tab">New tab</option>
                    <option value="iframe">Iframe</option>
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Iframe title
                  <input
                    type="text"
                    value={draft.iframeTitle}
                    onChange={(event) => update({ iframeTitle: event.target.value })}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Height
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.height}
                    onChange={(event) => update({ height: event.target.value })}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

              </div>
            ) : null}

            {draft.kind === 'report' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                L&apos;item `report` apre sempre il modulo report interno dell&apos;app. La configurazione operativa di folder, sharing e report builder avviene nel runtime workspace, non qui.
              </div>
            ) : null}

            {draft.kind === 'dashboard' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                L&apos;item `dashboard` apre sempre il modulo dashboard interno dell&apos;app. Cartelle, sharing, source report e widget vengono configurati nel runtime workspace.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Salva item
          </button>
        </div>
      </div>
    </div>
  )
}

function formatItemKind(kind: AppItemDraft['kind']): string {
  return ITEM_KIND_OPTIONS.find((option) => option.kind === kind)?.label ?? kind
}

function describeItemTarget(item: AppItemDraft): string {
  switch (item.kind) {
    case 'home':
      return 'Home applicativa'
    case 'entity':
      return item.entityId.trim() || 'Entity da selezionare'
    case 'custom-page':
      return describePageJson(item.pageJson)
    case 'external-link':
      return item.url.trim() || 'URL da configurare'
    case 'report':
      return 'Modulo report interno'
    case 'dashboard':
      return 'Modulo dashboard interno'
  }
}

function describeItemConfig(item: AppItemDraft): string {
  switch (item.kind) {
    case 'home':
    case 'custom-page':
      return describePageBlocks(item.pageJson)
    case 'entity':
      return 'Navigazione entity'
    case 'external-link':
      return summarizeValues([
        item.openMode === 'iframe' ? 'Iframe' : 'New tab',
        item.height.trim() ? `${item.height.trim()}px` : '',
      ])
    case 'report':
      return 'Workspace interno'
    case 'dashboard':
      return 'Workspace interno'
  }
}

function describePageJson(pageJson: string): string {
  const parsed = parsePageJsonSummary(pageJson)
  if (!parsed) {
    return 'Page JSON non valido'
  }

  return parsed.blocks.length > 0 ? `${parsed.blocks.length} blocchi` : 'Pagina vuota'
}

function describePageBlocks(pageJson: string): string {
  const parsed = parsePageJsonSummary(pageJson)
  if (!parsed) {
    return 'JSON non valido'
  }

  if (parsed.blocks.length === 0) {
    return 'Nessun blocco'
  }

  const types = [...new Set(parsed.blocks
    .map((block) => block?.type)
    .filter((type): type is string => typeof type === 'string' && type.trim().length > 0))]

  return `${parsed.blocks.length} blocchi${types.length > 0 ? ` • ${types.join(', ')}` : ''}`
}

function parsePageJsonSummary(pageJson: string): { blocks: Array<Record<string, unknown>> } | null {
  try {
    const parsed = JSON.parse(pageJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const blocks = Array.isArray((parsed as { blocks?: unknown }).blocks)
      ? ((parsed as { blocks: unknown[] }).blocks.filter(
          (block): block is Record<string, unknown> =>
            Boolean(block) && typeof block === 'object' && !Array.isArray(block),
        ))
      : []

    return { blocks }
  } catch {
    return null
  }
}

function summarizeValues(values: string[]): string {
  const normalized = values.map((value) => value.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized.join(' • ') : '-'
}
