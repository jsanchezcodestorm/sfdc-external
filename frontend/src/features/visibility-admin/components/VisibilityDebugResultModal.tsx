import { DetailBlock, DetailMetric, ToneBadge } from './VisibilityAdminPrimitives'

import type {
  VisibilityDebugEvaluation,
  VisibilityDebugPreview,
  VisibilityDebugPreviewScalar,
} from '../visibility-admin-types'

type VisibilityDebugResultModalProps = {
  open: boolean
  result: VisibilityDebugEvaluation | null
  preview: VisibilityDebugPreview | null
  onClose: () => void
}

function MetadataItem({
  label,
  value,
  monospace = false,
}: {
  label: string
  value: string
  monospace?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-sm text-slate-900 ${monospace ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function BadgeList({
  items,
  tone,
  emptyLabel,
}: {
  items: string[]
  tone: 'slate' | 'green' | 'amber' | 'rose' | 'sky'
  emptyLabel: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-700">{emptyLabel}</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <ToneBadge key={item} tone={tone}>
          {item}
        </ToneBadge>
      ))}
    </div>
  )
}

function formatPreviewValue(value: VisibilityDebugPreviewScalar): string {
  if (value === null) {
    return '-'
  }

  return String(value)
}

function buildPreviewStatusLabel(preview: VisibilityDebugPreview): string {
  if (preview.executed) {
    return 'Preview eseguita'
  }

  return preview.executionSkippedReason === 'VISIBILITY_DENY'
    ? 'Preview bloccata'
    : 'Preview senza campi'
}

function buildPreviewSkipMessage(preview: VisibilityDebugPreview): string {
  if (preview.executionSkippedReason === 'VISIBILITY_DENY') {
    return 'Preview non eseguita: la visibility ha negato l accesso per questo contesto.'
  }

  if (preview.executionSkippedReason === 'NO_VISIBLE_FIELDS') {
    return 'Preview non eseguita: nessuno dei campi richiesti resta visibile dopo il filtro field-level.'
  }

  return 'Preview non eseguita.'
}

function PreviewRecordsTable({
  selectedFields,
  records,
}: {
  selectedFields: string[]
  records: Array<Record<string, VisibilityDebugPreviewScalar>>
}) {
  if (selectedFields.length === 0) {
    return <p className="text-sm text-slate-700">Nessun campo selezionato per il preview.</p>
  }

  if (records.length === 0) {
    return <p className="text-sm text-slate-700">Nessun record restituito dal preview.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
        <thead className="bg-slate-50">
          <tr>
            {selectedFields.map((fieldName) => (
              <th
                key={fieldName}
                scope="col"
                className="px-3 py-2 font-semibold text-slate-600"
              >
                {fieldName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {records.map((record, rowIndex) => (
            <tr key={`preview-row-${rowIndex}`}>
              {selectedFields.map((fieldName) => (
                <td key={`${rowIndex}-${fieldName}`} className="px-3 py-2 align-top text-slate-800">
                  {formatPreviewValue(record[fieldName] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VisibilityDebugResultModal({
  open,
  result,
  preview,
  onClose,
}: VisibilityDebugResultModalProps) {
  const activeResult = preview?.visibility ?? result

  if (!open || !activeResult) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Result
            </p>
            <h3 className="text-lg font-semibold text-slate-900">Compiled Decision</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto bg-slate-50/60 px-5 py-4">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Decision Summary
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ToneBadge tone={activeResult.decision === 'ALLOW' ? 'green' : 'rose'}>
                      {activeResult.decision}
                    </ToneBadge>
                    {activeResult.recordType ? (
                      <ToneBadge tone="amber">{activeResult.recordType}</ToneBadge>
                    ) : null}
                    {preview ? (
                      <ToneBadge tone={preview.executed ? 'sky' : 'amber'}>
                        {buildPreviewStatusLabel(preview)}
                      </ToneBadge>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[30rem] xl:grid-cols-5">
                  <DetailMetric label="Decision" value={activeResult.decision} />
                  <DetailMetric label="Reason Code" value={activeResult.reasonCode} />
                  <DetailMetric label="Policy Version" value={String(activeResult.policyVersion)} />
                  <DetailMetric
                    label="Object Policy Version"
                    value={String(activeResult.objectPolicyVersion)}
                  />
                  <DetailMetric
                    label="Assignments"
                    value={String(activeResult.matchedAssignments?.length ?? 0)}
                  />
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-6">
                <DetailBlock label="Request Context">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetadataItem label="Object API Name" value={activeResult.objectApiName} />
                    <MetadataItem label="Contact ID" value={activeResult.contactId} monospace />
                    <MetadataItem
                      label="Record Type"
                      value={activeResult.recordType || '-'}
                    />
                    <MetadataItem
                      label="Row Count"
                      value={
                        typeof activeResult.rowCount === 'number' ? String(activeResult.rowCount) : '-'
                      }
                    />
                  </div>
                </DetailBlock>

                <DetailBlock label="Policy Resolution">
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Applied Cones
                      </p>
                      <BadgeList
                        items={activeResult.appliedCones}
                        tone="sky"
                        emptyLabel="Nessun cone applicato."
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Applied Rules
                      </p>
                      <BadgeList
                        items={activeResult.appliedRules}
                        tone="slate"
                        emptyLabel="Nessuna rule applicata."
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Matched Assignments
                      </p>
                      <BadgeList
                        items={activeResult.matchedAssignments ?? []}
                        tone="amber"
                        emptyLabel="Nessun assignment matchato."
                      />
                    </div>
                  </div>
                </DetailBlock>

                <DetailBlock label="Field Visibility">
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Compiled Fields
                      </p>
                      <BadgeList
                        items={activeResult.compiledFields ?? []}
                        tone="green"
                        emptyLabel="Nessun field set whitelist compilato."
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Denied Fields
                      </p>
                      <BadgeList
                        items={activeResult.deniedFields ?? []}
                        tone="rose"
                        emptyLabel="Nessun field deny compilato."
                      />
                    </div>

                    {preview ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Selected Fields
                        </p>
                        <BadgeList
                          items={preview.selectedFields}
                          tone="sky"
                          emptyLabel="Nessun campo selezionato per la preview."
                        />
                      </div>
                    ) : null}
                  </div>
                </DetailBlock>
              </div>

              <div className="space-y-6">
                <DetailBlock label="Final WHERE" preformatted>
                  {activeResult.finalWhere || '-'}
                </DetailBlock>

                {preview ? (
                  <>
                    <DetailBlock label="Executed SOQL" preformatted>
                      {preview.soql || '-'}
                    </DetailBlock>

                    <DetailBlock label="Preview Data">
                      {preview.executed ? (
                        <PreviewRecordsTable
                          selectedFields={preview.selectedFields}
                          records={preview.records}
                        />
                      ) : (
                        <p className="text-sm text-slate-700">{buildPreviewSkipMessage(preview)}</p>
                      )}
                    </DetailBlock>
                  </>
                ) : null}

                <div className="grid gap-6">
                  <DetailBlock label="Base WHERE" preformatted>
                    {activeResult.baseWhere || '-'}
                  </DetailBlock>

                  <DetailBlock label="Compiled Predicate" preformatted>
                    {activeResult.compiledPredicate || '-'}
                  </DetailBlock>

                  <DetailBlock label="Compiled Allow Predicate" preformatted>
                    {activeResult.compiledAllowPredicate || '-'}
                  </DetailBlock>

                  <DetailBlock label="Compiled Deny Predicate" preformatted>
                    {activeResult.compiledDenyPredicate || '-'}
                  </DetailBlock>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
