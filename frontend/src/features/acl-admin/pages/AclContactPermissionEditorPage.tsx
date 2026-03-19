import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppDialog } from '../../../components/app-dialog'
import {
  deleteAclContactPermission,
  fetchAclContactPermission,
  fetchAclDefaultPermissions,
  fetchAclPermissions,
  updateAclContactPermission,
} from '../acl-admin-api'
import type {
  AclAdminDefaultPermissionItem,
  AclAdminPermissionSummary,
} from '../acl-admin-types'
import { AclContactQuickFind } from '../components/AclContactQuickFind'
import {
  createContactPermissionDraft,
  createEmptyContactPermissionDraft,
  normalizeContactPermissionDraft,
  type AclContactPermissionDraft,
} from '../acl-admin-utils'

type AclContactPermissionEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  contactId?: string
}

export function AclContactPermissionEditorPage({
  mode,
}: AclContactPermissionEditorPageProps) {
  const { confirm } = useAppDialog()
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const previousContactId = params.contactId ? decodeURIComponent(params.contactId) : null
  const [draft, setDraft] = useState<AclContactPermissionDraft>(createEmptyContactPermissionDraft())
  const [permissions, setPermissions] = useState<AclAdminPermissionSummary[]>([])
  const [defaultPermissions, setDefaultPermissions] = useState<AclAdminDefaultPermissionItem[]>([])
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const loadPromise =
      mode === 'edit' && previousContactId
        ? Promise.all([
            fetchAclPermissions(),
            fetchAclDefaultPermissions(),
            fetchAclContactPermission(previousContactId),
          ])
        : Promise.all([
            fetchAclPermissions(),
            fetchAclDefaultPermissions(),
            Promise.resolve(null),
          ])

    void loadPromise
      .then(([permissionsPayload, defaultsPayload, contactPermissionsPayload]) => {
        if (cancelled) {
          return
        }

        const nextPermissions = permissionsPayload.items ?? []
        const nextDefaults = defaultsPayload.items ?? []

        setPermissions(nextPermissions)
        setDefaultPermissions(nextDefaults)

        if (contactPermissionsPayload) {
          setDraft(createContactPermissionDraft(contactPermissionsPayload.contactPermissions))
        } else {
          setDraft(createEmptyContactPermissionDraft())
        }

        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento contact permissions'
        setPageError(message)
        setPermissions([])
        setDefaultPermissions([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mode, previousContactId])

  const normalizedDraft = useMemo(() => normalizeContactPermissionDraft(draft), [draft])
  const defaultPermissionItems = useMemo(
    () => defaultPermissions.filter((item) => item.enabled),
    [defaultPermissions],
  )
  const selectedExplicitPermissions = useMemo(
    () => new Set(normalizedDraft.permissionCodes),
    [normalizedDraft.permissionCodes],
  )
  const effectivePermissionItems = useMemo(
    () => permissions.filter((item) => selectedExplicitPermissions.has(item.code)),
    [permissions, selectedExplicitPermissions],
  )

  const togglePermission = (permissionCode: string) => {
    setDraft((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(permissionCode)
        ? current.permissionCodes.filter((entry) => entry !== permissionCode)
        : [...current.permissionCodes, permissionCode],
    }))
  }

  const saveContactPermissions = async () => {
    if (!normalizedDraft.contactId) {
      setPageError('Il Contact ID è obbligatorio')
      return
    }

    if (normalizedDraft.permissionCodes.length === 0) {
      setPageError('Seleziona almeno un permission code esplicito')
      return
    }

    setSaving(true)
    setPageError(null)

    try {
      const payload = await updateAclContactPermission(
        normalizedDraft.contactId,
        normalizedDraft.permissionCodes,
      )

      navigate(
        `/admin/acl/contact-permissions/${encodeURIComponent(payload.contactPermissions.contactId)}/edit`,
        {
          replace: true,
        },
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore salvataggio contact permissions'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const removeContactPermissions = async () => {
    const contactId = previousContactId ?? normalizedDraft.contactId
    if (!contactId) {
      return
    }

    const confirmed = await confirm({
      title: 'Rimuovi assegnazioni ACL',
      description: `Rimuovere tutte le assegnazioni ACL esplicite per il contact ${contactId}?`,
      confirmLabel: 'Rimuovi',
      cancelLabel: 'Annulla',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    setRemoving(true)
    setPageError(null)

    try {
      await deleteAclContactPermission(contactId)
      navigate('/admin/acl/contact-permissions', { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore rimozione contact permissions'
      setPageError(message)
    } finally {
      setRemoving(false)
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
            {mode === 'create'
              ? 'Nuova assegnazione ACL Contact'
              : previousContactId || 'Contact permissions'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/acl/contact-permissions')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista contact permissions
          </button>
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={() => {
                void removeContactPermissions()
              }}
              disabled={loading || removing}
              className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {removing ? 'Rimozione...' : 'Rimuovi tutte'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void saveContactPermissions()
            }}
            disabled={
              loading ||
              saving ||
              permissions.length === 0 ||
              !normalizedDraft.contactId ||
              normalizedDraft.permissionCodes.length === 0
            }
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva assegnazioni'}
          </button>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento contact permissions...</p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="text-sm font-medium text-slate-700">
              Contact ID
              {mode === 'create' ? (
                <AclContactQuickFind
                  value={draft.contactId}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      contactId: value,
                    }))
                  }
                  onSelect={(suggestion) =>
                    setDraft((current) => ({
                      ...current,
                      contactId: suggestion.id,
                    }))
                  }
                  placeholder="Cerca per Id o nome Contact"
                />
              ) : (
                <input
                  type="text"
                  value={normalizedDraft.contactId}
                  readOnly
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700 outline-none"
                />
              )}
              <p className="mt-2 text-xs text-slate-500">
                Il Contact Salesforce e il target dell&apos;assegnazione esplicita.
              </p>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Legacy default permissions</p>
              <p className="mt-1 text-xs text-slate-500">
                Restano visibili per compatibilita snapshot, ma non vengono piu applicati come
                baseline operativa alle sessioni o alle risorse ACL `permission-bound`.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {defaultPermissionItems.length > 0 ? (
                  defaultPermissionItems.map((item) => (
                    <span
                      key={item.permissionCode}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                    >
                      {item.permissionCode}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    Nessun default legacy configurato. Nuove sessioni partono senza baseline ACL.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Explicit permissions</p>
                <p className="mt-1 text-xs text-slate-500">
                  Questa e la fonte primaria dei permessi ACL effettivi del contact. Diventano
                  effettivi dalla prossima request autenticata.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                {normalizedDraft.permissionCodes.length} selezionati
              </p>
            </div>

            {permissions.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Nessun permission code disponibile nel catalogo ACL.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {permissions.map((item) => (
                  <label
                    key={item.code}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedExplicitPermissions.has(item.code)}
                      onChange={() => togglePermission(item.code)}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{item.code}</p>
                      {item.label ? (
                        <p className="mt-1 text-sm text-slate-600">{item.label}</p>
                      ) : null}
                      {item.description ? (
                        <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">Effective ACL permissions</p>
            <p className="mt-1 text-xs text-slate-500">
              Questa anteprima mostra il set ACL ricavato dalle assegnazioni esplicite salvate su
              questo contact. Eventuali fallback runtime dedicati non sono mostrati qui.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {effectivePermissionItems.length > 0 ? (
                effectivePermissionItems.map((item) => (
                  <span
                    key={item.code}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                  >
                    {item.code}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Nessuna permission esplicita assegnata. Le risorse `permission-bound` risponderanno
                  `DENY` salvo fallback runtime specifici.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
