import { useState } from 'react'

import type { AclResourceConfig } from '../acl-admin-types'
import {
  ACL_RESOURCE_TYPE_OPTIONS,
  createEmptyResource,
  normalizeResource,
} from '../acl-admin-utils'

import { AclAdminModal } from './AclAdminModal'

type ResourceEditorModalProps = {
  mode: 'create' | 'edit'
  open: boolean
  initialValue?: AclResourceConfig
  permissionCodes: string[]
  onClose: () => void
  onSave: (resource: AclResourceConfig) => void
}

export function ResourceEditorModal({
  mode,
  open,
  initialValue,
  permissionCodes,
  onClose,
  onSave,
}: ResourceEditorModalProps) {
  const [draft, setDraft] = useState<AclResourceConfig>(
    () => initialValue ?? createEmptyResource(),
  )
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const normalized = normalizeResource(draft)

    if (!normalized.id) {
      setError('Il resource id è obbligatorio')
      return
    }

    onSave(normalized)
  }

  return (
    <AclAdminModal
      open={open}
      onClose={onClose}
      eyebrow={mode === 'create' ? 'Nuova risorsa' : 'Modifica risorsa'}
      title={draft.id || 'Resource editor'}
      footer={
        <>
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
            Salva
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Resource id
            <input
              type="text"
              value={draft.id}
              onChange={(event) => {
                setDraft((current) => ({ ...current, id: event.target.value }))
                setError(null)
              }}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Type
            <select
              value={draft.type}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  type: event.target.value as AclResourceConfig['type'],
                }))
                setError(null)
              }}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              {ACL_RESOURCE_TYPE_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Target
          <input
            type="text"
            value={draft.target ?? ''}
            onChange={(event) => {
              setDraft((current) => ({ ...current, target: event.target.value }))
              setError(null)
            }}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            value={draft.description ?? ''}
            onChange={(event) => {
              setDraft((current) => ({ ...current, description: event.target.value }))
              setError(null)
            }}
            rows={3}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <div className="space-y-3">
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
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        permissions: event.target.checked
                          ? [...current.permissions, permissionCode]
                          : current.permissions.filter((code) => code !== permissionCode),
                      }))
                      setError(null)
                    }}
                  />
                  <span>{permissionCode}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </AclAdminModal>
  )
}
