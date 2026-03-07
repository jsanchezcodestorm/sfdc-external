import { useState } from 'react'

import type { AclPermissionDefinition } from '../acl-admin-types'
import { createEmptyPermission, normalizePermission } from '../acl-admin-utils'

import { AclAdminModal } from './AclAdminModal'

type PermissionEditorModalProps = {
  mode: 'create' | 'edit'
  open: boolean
  initialValue?: AclPermissionDefinition
  onClose: () => void
  onSave: (permission: AclPermissionDefinition) => void
}

export function PermissionEditorModal({
  mode,
  open,
  initialValue,
  onClose,
  onSave,
}: PermissionEditorModalProps) {
  const [draft, setDraft] = useState<AclPermissionDefinition>(
    () => initialValue ?? createEmptyPermission(),
  )
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const normalized = normalizePermission(draft)

    if (!normalized.code) {
      setError('Il permission code è obbligatorio')
      return
    }

    onSave(normalized)
  }

  return (
    <AclAdminModal
      open={open}
      onClose={onClose}
      eyebrow={mode === 'create' ? 'Nuovo permesso' : 'Modifica permesso'}
      title={draft.code || 'Permission editor'}
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
            Permission code
            <input
              type="text"
              value={draft.code}
              onChange={(event) => {
                setDraft((current) => ({ ...current, code: event.target.value }))
                setError(null)
              }}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Label
            <input
              type="text"
              value={draft.label ?? ''}
              onChange={(event) => {
                setDraft((current) => ({ ...current, label: event.target.value }))
                setError(null)
              }}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>

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
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">Aliases</p>
            <button
              type="button"
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  aliases: [...(current.aliases ?? []), ''],
                }))
                setError(null)
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            >
              Aggiungi alias
            </button>
          </div>

          {(draft.aliases ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Nessun alias configurato.</p>
          ) : null}

          {(draft.aliases ?? []).map((alias, index) => (
            <div
              key={`alias-${index}`}
              className="flex gap-2"
            >
              <input
                type="text"
                value={alias}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    aliases: (current.aliases ?? []).map((entry, currentIndex) =>
                      currentIndex === index ? event.target.value : entry,
                    ),
                  }))
                  setError(null)
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
              <button
                type="button"
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    aliases: (current.aliases ?? []).filter((_, currentIndex) => currentIndex !== index),
                  }))
                  setError(null)
                }}
                className="rounded-md border border-rose-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
              >
                Rimuovi
              </button>
            </div>
          ))}
        </div>
      </div>
    </AclAdminModal>
  )
}
