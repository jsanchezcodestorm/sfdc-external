import { AclResourceStatusNotice } from '../../../components/AclResourceStatusNotice'
import type { Dispatch, SetStateAction } from 'react'

import type { AclResourceStatus } from '../../../lib/acl-resource-status'
import {
  formatAclResourceAccessMode,
  formatAclResourceSyncState,
} from '../../../lib/acl-resource-status'
import type {
  DefaultParamDraft,
  QueryTemplateDraft,
} from '../query-template-admin-utils'

type QueryTemplateEditorFormProps = {
  draft: QueryTemplateDraft
  setDraft: Dispatch<SetStateAction<QueryTemplateDraft>>
  aclResourceStatus: AclResourceStatus | null
  disableIdField?: boolean
  idHelperText?: string
}

export function QueryTemplateEditorForm({
  draft,
  setDraft,
  aclResourceStatus,
  disableIdField = false,
  idHelperText,
}: QueryTemplateEditorFormProps) {
  const aclResourceId = draft.id.trim()
  const showAclNotice = aclResourceId.length > 0

  const updateDefaultParam = (
    index: number,
    field: keyof DefaultParamDraft,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      defaultParams: current.defaultParams.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }))
  }

  return (
    <div className="mt-5 space-y-5">
      {showAclNotice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <p>
            <code className="font-mono">query:{aclResourceId}</code>{' '}
            {aclResourceStatus
              ? `- ${formatAclResourceAccessMode(aclResourceStatus.accessMode)} / ${formatAclResourceSyncState(aclResourceStatus.syncState)}`
              : '- verra creata automaticamente come risorsa system disabilitata'}
          </p>
          {aclResourceStatus ? (
            <AclResourceStatusNotice
              status={aclResourceStatus}
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800"
            />
          ) : (
            <p className="mt-1">
              Dopo il primo salvataggio potrai attivarla dal modulo ACL associando una permission o cambiando l access mode.
            </p>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Template ID
          <input
            type="text"
            value={draft.id}
            onChange={(event) =>
              setDraft((current) => ({ ...current, id: event.target.value }))
            }
            disabled={disableIdField}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
          />
          {idHelperText ? (
            <span className="mt-2 block text-xs font-normal text-slate-500">{idHelperText}</span>
          ) : null}
        </label>

        <label className="text-sm font-medium text-slate-700">
          Object API Name
          <input
            type="text"
            value={draft.objectApiName}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                objectApiName: event.target.value,
              }))
            }
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="text-sm font-medium text-slate-700">
          Description
          <input
            type="text"
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Max limit
          <input
            type="number"
            min={1}
            value={draft.maxLimit}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                maxLimit: event.target.value,
              }))
            }
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        SOQL
        <textarea
          value={draft.soql}
          onChange={(event) =>
            setDraft((current) => ({ ...current, soql: event.target.value }))
          }
          rows={12}
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </label>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Default Params</p>
            <p className="mt-1 text-xs text-slate-500">
              Valori scalar `string | number | boolean`.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                defaultParams: [
                  ...current.defaultParams,
                  { key: '', type: 'string', value: '' },
                ],
              }))
            }
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-white"
          >
            Aggiungi parametro
          </button>
        </div>

        {draft.defaultParams.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {draft.defaultParams.map((param, index) => (
              <div
                key={`${param.key || 'param'}-${index}`}
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_7rem]"
              >
                <input
                  type="text"
                  value={param.key}
                  onChange={(event) => updateDefaultParam(index, 'key', event.target.value)}
                  placeholder="Parametro"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />

                <select
                  value={param.type}
                  onChange={(event) => updateDefaultParam(index, 'type', event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                </select>

                <input
                  type="text"
                  value={param.value}
                  onChange={(event) => updateDefaultParam(index, 'value', event.target.value)}
                  placeholder="Valore"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />

                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      defaultParams: current.defaultParams.filter(
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
        ) : (
          <p className="mt-4 text-sm text-slate-500">Nessun parametro di default configurato.</p>
        )}
      </div>
    </div>
  )
}
