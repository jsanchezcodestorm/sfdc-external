import { useEffect, useMemo, useState } from 'react'

import { fetchAclPermissions } from '../../acl-admin/acl-admin-api'
import { SalesforceFieldMultiSelect } from '../../entities-admin/components/SalesforceFieldMultiSelect'
import { ObjectApiNameQuickFind } from '../../entities-admin/components/detail-form/ObjectApiNameQuickFind'
import { evaluateVisibilityDebug, previewVisibilityDebug } from '../visibility-admin-api'
import { ContactQuickFind } from '../components/ContactQuickFind'
import { VisibilityDebugResultModal } from '../components/VisibilityDebugResultModal'
import type {
  VisibilityDebugContactSuggestion,
  VisibilityDebugEvaluation,
  VisibilityDebugPreview,
} from '../visibility-admin-types'

type DebugDraft = {
  objectApiName: string
  contactId: string
  permissions: string[]
  recordType: string
  baseWhere: string
  requestedFields: string[]
  previewLimit: number
}

const EMPTY_DEBUG_DRAFT: DebugDraft = {
  objectApiName: '',
  contactId: '',
  permissions: [],
  recordType: '',
  baseWhere: '',
  requestedFields: [],
  previewLimit: 10,
}

export function VisibilityDebugPage() {
  const [draft, setDraft] = useState<DebugDraft>(EMPTY_DEBUG_DRAFT)
  const [permissionCodes, setPermissionCodes] = useState<string[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(true)
  const [runningAction, setRunningAction] = useState<'evaluate' | 'preview' | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [result, setResult] = useState<VisibilityDebugEvaluation | null>(null)
  const [preview, setPreview] = useState<VisibilityDebugPreview | null>(null)
  const [isResultModalOpen, setIsResultModalOpen] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [isRecordTypeAutoFilled, setIsRecordTypeAutoFilled] = useState(false)

  useEffect(() => {
    let cancelled = false

    void fetchAclPermissions()
      .then((payload) => {
        if (cancelled) {
          return
        }

        setPermissionCodes((payload.items ?? []).map((entry) => entry.code))
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento permission catalog'
        setPageError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPermissions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const selectedPermissionSet = useMemo(() => new Set(draft.permissions), [draft.permissions])

  const togglePermission = (permissionCode: string) => {
    setDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permissionCode)
        ? current.permissions.filter((entry) => entry !== permissionCode)
        : [...current.permissions, permissionCode],
    }))
  }

  const handleContactChange = (value: string) => {
    const trimmedValue = value.trim()
    const shouldClearRecordType =
      selectedContactId !== null &&
      trimmedValue !== selectedContactId &&
      isRecordTypeAutoFilled

    setDraft((current) => ({
      ...current,
      contactId: value,
      recordType: shouldClearRecordType ? '' : current.recordType,
    }))

    if (selectedContactId !== null && trimmedValue !== selectedContactId) {
      setSelectedContactId(null)
      setIsRecordTypeAutoFilled(false)
    }
  }

  const handleContactSelect = (suggestion: VisibilityDebugContactSuggestion) => {
    setDraft((current) => ({
      ...current,
      contactId: suggestion.id,
      recordType: suggestion.recordTypeDeveloperName ?? '',
    }))
    setSelectedContactId(suggestion.id)
    setIsRecordTypeAutoFilled(true)
  }

  const handleRecordTypeChange = (value: string) => {
    setDraft((current) => ({
      ...current,
      recordType: value,
    }))
    setIsRecordTypeAutoFilled(false)
  }

  const runEvaluation = async () => {
    setRunningAction('evaluate')
    setPageError(null)

    try {
      const payload = await evaluateVisibilityDebug({
        objectApiName: draft.objectApiName.trim(),
        contactId: draft.contactId.trim(),
        permissions: draft.permissions,
        recordType: draft.recordType.trim() || undefined,
        baseWhere: draft.baseWhere.trim() || undefined,
        requestedFields:
          draft.requestedFields.length > 0 ? draft.requestedFields : undefined,
      })

      setResult(payload)
      setPreview(null)
      setIsResultModalOpen(true)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore esecuzione debug visibility'
      setPageError(message)
      setResult(null)
      setPreview(null)
      setIsResultModalOpen(false)
    } finally {
      setRunningAction(null)
    }
  }

  const runPreview = async () => {
    setRunningAction('preview')
    setPageError(null)

    try {
      const payload = await previewVisibilityDebug({
        objectApiName: draft.objectApiName.trim(),
        contactId: draft.contactId.trim(),
        permissions: draft.permissions,
        recordType: draft.recordType.trim() || undefined,
        baseWhere: draft.baseWhere.trim() || undefined,
        requestedFields: draft.requestedFields,
        limit: draft.previewLimit,
      })

      setResult(payload.visibility)
      setPreview(payload)
      setIsResultModalOpen(true)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore esecuzione preview visibility'
      setPageError(message)
      setResult(null)
      setPreview(null)
      setIsResultModalOpen(false)
    } finally {
      setRunningAction(null)
    }
  }

  const canRunPreview = draft.requestedFields.length > 0

  return (
    <div className="w-full">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Debug
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Visibility Evaluation</h2>
          <p className="mt-1 text-sm text-slate-600">
            Simula il contesto utente e verifica il filtro finale applicato.
          </p>
        </div>

        {pageError ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {pageError}
          </p>
        ) : null}

        <div className="mt-5 space-y-5">
          <label className="text-sm font-medium text-slate-700">
            Object API Name
            <ObjectApiNameQuickFind
              value={draft.objectApiName}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  objectApiName: value,
                }))
              }
              placeholder="Account"
            />
          </label>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Contact ID
              <ContactQuickFind
                value={draft.contactId}
                onChange={handleContactChange}
                onSelect={handleContactSelect}
                placeholder="003... o Contact Name"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Record Type
              <input
                type="text"
                value={draft.recordType}
                onChange={(event) => handleRecordTypeChange(event.target.value)}
                placeholder="Partner"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Base WHERE
            <textarea
              rows={4}
              value={draft.baseWhere}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  baseWhere: event.target.value,
                }))
              }
              placeholder="Status__c = 'Active'"
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <SalesforceFieldMultiSelect
            label="Requested Fields"
            objectApiName={draft.objectApiName}
            value={draft.requestedFields}
            helperText="Campo facoltativo per l evaluate puro; obbligatorio per Preview dati."
            onChange={(requestedFields) =>
              setDraft((current) => ({
                ...current,
                requestedFields,
              }))
            }
          />

          <label className="text-sm font-medium text-slate-700">
            Preview Limit
            <input
              type="number"
              min={1}
              max={25}
              value={draft.previewLimit}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  previewLimit: Number.isFinite(event.target.valueAsNumber)
                    ? event.target.valueAsNumber
                    : 10,
                }))
              }
              className="mt-2 block w-full max-w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Campione massimo 25 record per preview.
            </span>
          </label>

          <div>
            <p className="text-sm font-medium text-slate-700">Permissions</p>
            {loadingPermissions ? (
              <p className="mt-2 text-sm text-slate-500">Caricamento permission catalog...</p>
            ) : permissionCodes.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {permissionCodes.map((permissionCode) => (
                  <button
                    key={permissionCode}
                    type="button"
                    onClick={() => togglePermission(permissionCode)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                      selectedPermissionSet.has(permissionCode)
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {permissionCode}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Nessun permission code disponibile.</p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                void runPreview()
              }}
              disabled={runningAction !== null || !canRunPreview}
              className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {runningAction === 'preview' ? 'Preview...' : 'Preview dati'}
            </button>
            <button
              type="button"
              onClick={() => {
                void runEvaluation()
              }}
              disabled={runningAction !== null}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {runningAction === 'evaluate' ? 'Valutazione...' : 'Esegui debug'}
            </button>
          </div>
        </div>
      </section>

      <VisibilityDebugResultModal
        open={isResultModalOpen}
        result={result}
        preview={preview}
        onClose={() => setIsResultModalOpen(false)}
      />
    </div>
  )
}
