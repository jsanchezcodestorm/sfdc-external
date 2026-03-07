import { useEffect, useMemo, useState } from 'react'

import { fetchAclPermissions } from '../../acl-admin/acl-admin-api'
import { SalesforceFieldMultiSelect } from '../../entities-admin/components/SalesforceFieldMultiSelect'
import { ObjectApiNameQuickFind } from '../../entities-admin/components/detail-form/ObjectApiNameQuickFind'
import { evaluateVisibilityDebug } from '../visibility-admin-api'
import { DetailBlock, DetailMetric, ToneBadge } from '../components/VisibilityAdminPrimitives'
import type { VisibilityDebugEvaluation } from '../visibility-admin-types'

type DebugDraft = {
  objectApiName: string
  contactId: string
  permissions: string[]
  recordType: string
  baseWhere: string
  requestedFields: string[]
}

const EMPTY_DEBUG_DRAFT: DebugDraft = {
  objectApiName: '',
  contactId: '',
  permissions: [],
  recordType: '',
  baseWhere: '',
  requestedFields: [],
}

export function VisibilityDebugPage() {
  const [draft, setDraft] = useState<DebugDraft>(EMPTY_DEBUG_DRAFT)
  const [permissionCodes, setPermissionCodes] = useState<string[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(true)
  const [running, setRunning] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [result, setResult] = useState<VisibilityDebugEvaluation | null>(null)

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

  const runEvaluation = async () => {
    setRunning(true)
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Errore esecuzione debug visibility'
      setPageError(message)
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Debug
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Visibility Evaluation</h2>
          <p className="mt-1 text-sm text-slate-600">
            Simula il contesto utente e verifica il predicate finale compilato dal motore runtime.
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
              <input
                type="text"
                value={draft.contactId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    contactId: event.target.value,
                  }))
                }
                placeholder="003..."
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Record Type
              <input
                type="text"
                value={draft.recordType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recordType: event.target.value,
                  }))
                }
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
            helperText="Campo facoltativo: se valorizzato, il debug mostra anche il field set finale filtrato."
            onChange={(requestedFields) =>
              setDraft((current) => ({
                ...current,
                requestedFields,
              }))
            }
          />

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

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                void runEvaluation()
              }}
              disabled={running}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {running ? 'Valutazione...' : 'Esegui debug'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Result
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Compiled Decision</h2>
        </div>

        {result ? (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailMetric label="Decision" value={result.decision} />
              <DetailMetric label="Reason Code" value={result.reasonCode} />
              <DetailMetric label="Policy Version" value={String(result.policyVersion)} />
              <DetailMetric
                label="Assignments"
                value={String(result.matchedAssignments?.length ?? 0)}
              />
            </div>

            <DetailBlock label="Decision Summary">
              <div className="flex flex-wrap gap-2">
                <ToneBadge tone={result.decision === 'ALLOW' ? 'green' : 'rose'}>
                  {result.decision}
                </ToneBadge>
                {result.recordType ? <ToneBadge tone="amber">{result.recordType}</ToneBadge> : null}
              </div>
            </DetailBlock>
            <DetailBlock label="Applied Cones">
              {result.appliedCones.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.appliedCones.map((coneCode) => (
                    <ToneBadge key={coneCode} tone="sky">
                      {coneCode}
                    </ToneBadge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-700">Nessun cone applicato.</p>
              )}
            </DetailBlock>
            <DetailBlock label="Applied Rules">
              {result.appliedRules.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.appliedRules.map((ruleId) => (
                    <ToneBadge key={ruleId} tone="slate">
                      {ruleId}
                    </ToneBadge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-700">Nessuna rule applicata.</p>
              )}
            </DetailBlock>
            <DetailBlock label="Matched Assignments">
              {result.matchedAssignments && result.matchedAssignments.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.matchedAssignments.map((assignmentId) => (
                    <ToneBadge key={assignmentId} tone="amber">
                      {assignmentId}
                    </ToneBadge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-700">Nessun assignment matchato.</p>
              )}
            </DetailBlock>
            <DetailBlock label="Compiled Fields">
              {result.compiledFields && result.compiledFields.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.compiledFields.map((field) => (
                    <ToneBadge key={field} tone="green">
                      {field}
                    </ToneBadge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-700">Nessun field set whitelist compilato.</p>
              )}
            </DetailBlock>
            <DetailBlock label="Denied Fields">
              {result.deniedFields && result.deniedFields.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.deniedFields.map((field) => (
                    <ToneBadge key={field} tone="rose">
                      {field}
                    </ToneBadge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-700">Nessun field deny compilato.</p>
              )}
            </DetailBlock>
            <DetailBlock label="Compiled Allow Predicate" preformatted>
              {result.compiledAllowPredicate || '-'}
            </DetailBlock>
            <DetailBlock label="Compiled Deny Predicate" preformatted>
              {result.compiledDenyPredicate || '-'}
            </DetailBlock>
            <DetailBlock label="Compiled Predicate" preformatted>
              {result.compiledPredicate || '-'}
            </DetailBlock>
            <DetailBlock label="Base WHERE" preformatted>
              {result.baseWhere || '-'}
            </DetailBlock>
            <DetailBlock label="Final WHERE" preformatted>
              {result.finalWhere || '-'}
            </DetailBlock>
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-600">
            Esegui una valutazione dal pannello di sinistra per vedere predicate, field set e
            decisione finale del motore visibility.
          </p>
        )}
      </section>
    </div>
  )
}
