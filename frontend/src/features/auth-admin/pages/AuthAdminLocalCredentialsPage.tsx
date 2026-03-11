import { useEffect, useState } from 'react'

import { AclContactQuickFind } from '../../acl-admin/components/AclContactQuickFind'
import type { AclAdminContactSuggestion } from '../../acl-admin/acl-admin-types'
import {
  deleteAuthAdminLocalCredential,
  fetchAuthAdminLocalCredentials,
  upsertAuthAdminLocalCredential,
} from '../auth-admin-api'
import type { AuthAdminLocalCredentialItem } from '../auth-admin-types'

export function AuthAdminLocalCredentialsPage() {
  const [items, setItems] = useState<AuthAdminLocalCredentialItem[]>([])
  const [contactQuery, setContactQuery] = useState('')
  const [selectedContact, setSelectedContact] = useState<AclAdminContactSuggestion | null>(null)
  const [password, setPassword] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mutatingContactIds, setMutatingContactIds] = useState<Record<string, boolean>>({})

  const loadItems = async () => {
    const payload = await fetchAuthAdminLocalCredentials()
    setItems(payload.items ?? [])
  }

  useEffect(() => {
    let cancelled = false

    void loadItems()
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento credenziali locali'
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

  const handleSelectContact = (suggestion: AclAdminContactSuggestion) => {
    setSelectedContact(suggestion)
    setContactQuery(suggestion.name ? `${suggestion.name} (${suggestion.id})` : suggestion.id)
  }

  const handleSaveCredential = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedContact) {
      setPageError('Seleziona prima un Contact Salesforce')
      return
    }

    setSaving(true)

    try {
      const payload = await upsertAuthAdminLocalCredential(selectedContact.id, {
        password: password.trim() || undefined,
        enabled,
      })

      setItems((current) => upsertCredential(current, payload.credential))
      setPassword('')
      setPageError(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore salvataggio credenziale locale'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const toggleCredential = async (item: AuthAdminLocalCredentialItem) => {
    setMutatingContactIds((current) => ({ ...current, [item.contactId]: true }))

    try {
      const payload = await upsertAuthAdminLocalCredential(item.contactId, {
        enabled: !item.enabled,
      })
      setItems((current) => upsertCredential(current, payload.credential))
      setPageError(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Errore aggiornamento credenziale ${item.contactId}`
      setPageError(message)
    } finally {
      setMutatingContactIds((current) => ({ ...current, [item.contactId]: false }))
    }
  }

  const removeCredential = async (item: AuthAdminLocalCredentialItem) => {
    setMutatingContactIds((current) => ({ ...current, [item.contactId]: true }))

    try {
      await deleteAuthAdminLocalCredential(item.contactId)
      setItems((current) => current.filter((entry) => entry.contactId !== item.contactId))
      setPageError(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Errore eliminazione credenziale ${item.contactId}`
      setPageError(message)
    } finally {
      setMutatingContactIds((current) => ({ ...current, [item.contactId]: false }))
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Backoffice Auth
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">Local Credentials</h2>
        <p className="mt-1 text-sm text-slate-600">
          Il username viene derivato dall&apos;email attuale del Contact Salesforce selezionato.
        </p>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      <form className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={(event) => void handleSaveCredential(event)}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.9fr)_auto]">
          <label className="text-sm font-medium text-slate-700">
            Contact Salesforce
            <AclContactQuickFind
              value={contactQuery}
              onChange={(value) => {
                setContactQuery(value)
                setSelectedContact(null)
              }}
              onSelect={handleSelectContact}
              placeholder="Cerca per nome o Contact Id"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Nuova password oppure vuoto per mantenere quella esistente"
            />
          </label>

          <div className="flex flex-col justify-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Enabled
            </label>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Salvataggio...' : 'Salva credenziale'}
            </button>
          </div>
        </div>
      </form>

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento credenziali...</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Username</th>
                  <th className="px-4 py-3 text-left">Stato</th>
                  <th className="px-4 py-3 text-left">Tentativi</th>
                  <th className="px-4 py-3 text-left">Ultimo login</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length > 0 ? (
                  items.map((item) => (
                    <tr key={item.contactId} className="bg-white">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {item.contactName ?? item.contactId}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.contactEmail ?? item.contactId}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{item.username}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                            item.enabled
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.enabled ? 'enabled' : 'disabled'}
                        </span>
                        {item.lockedUntil ? (
                          <p className="mt-1 text-xs text-amber-700">
                            Locked fino a {new Date(item.lockedUntil).toLocaleString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.failedAttempts}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void toggleCredential(item)
                            }}
                            disabled={Boolean(mutatingContactIds[item.contactId])}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {item.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void removeCredential(item)
                            }}
                            disabled={Boolean(mutatingContactIds[item.contactId])}
                            className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-sm text-slate-500">
                      Nessuna credenziale locale configurata.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function upsertCredential(
  items: AuthAdminLocalCredentialItem[],
  nextCredential: AuthAdminLocalCredentialItem,
): AuthAdminLocalCredentialItem[] {
  const existing = items.some((item) => item.contactId === nextCredential.contactId)
  const nextItems = existing
    ? items.map((item) =>
        item.contactId === nextCredential.contactId ? nextCredential : item,
      )
    : [nextCredential, ...items]

  return nextItems.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}
