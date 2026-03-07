import { DetailBlock, DetailMetric, ToneBadge } from './VisibilityAdminPrimitives'

import type { VisibilityDebugEvaluation } from '../visibility-admin-types'

type VisibilityDebugResultModalProps = {
  open: boolean
  result: VisibilityDebugEvaluation | null
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

export function VisibilityDebugResultModal({
  open,
  result,
  onClose,
}: VisibilityDebugResultModalProps) {
  if (!open || !result) {
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
                    <ToneBadge tone={result.decision === 'ALLOW' ? 'green' : 'rose'}>
                      {result.decision}
                    </ToneBadge>
                    {result.recordType ? (
                      <ToneBadge tone="amber">{result.recordType}</ToneBadge>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[30rem] xl:grid-cols-4">
                  <DetailMetric label="Decision" value={result.decision} />
                  <DetailMetric label="Reason Code" value={result.reasonCode} />
                  <DetailMetric label="Policy Version" value={String(result.policyVersion)} />
                  <DetailMetric
                    label="Assignments"
                    value={String(result.matchedAssignments?.length ?? 0)}
                  />
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-6">
                <DetailBlock label="Request Context">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetadataItem label="Object API Name" value={result.objectApiName} />
                    <MetadataItem label="Contact ID" value={result.contactId} monospace />
                    <MetadataItem
                      label="Record Type"
                      value={result.recordType || '-'}
                    />
                    <MetadataItem
                      label="Row Count"
                      value={
                        typeof result.rowCount === 'number' ? String(result.rowCount) : '-'
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
                        items={result.appliedCones}
                        tone="sky"
                        emptyLabel="Nessun cone applicato."
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Applied Rules
                      </p>
                      <BadgeList
                        items={result.appliedRules}
                        tone="slate"
                        emptyLabel="Nessuna rule applicata."
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Matched Assignments
                      </p>
                      <BadgeList
                        items={result.matchedAssignments ?? []}
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
                        items={result.compiledFields ?? []}
                        tone="green"
                        emptyLabel="Nessun field set whitelist compilato."
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Denied Fields
                      </p>
                      <BadgeList
                        items={result.deniedFields ?? []}
                        tone="rose"
                        emptyLabel="Nessun field deny compilato."
                      />
                    </div>
                  </div>
                </DetailBlock>
              </div>

              <div className="space-y-6">
                <DetailBlock label="Final WHERE" preformatted>
                  {result.finalWhere || '-'}
                </DetailBlock>

                <div className="grid gap-6">
                  <DetailBlock label="Base WHERE" preformatted>
                    {result.baseWhere || '-'}
                  </DetailBlock>

                  <DetailBlock label="Compiled Predicate" preformatted>
                    {result.compiledPredicate || '-'}
                  </DetailBlock>

                  <DetailBlock label="Compiled Allow Predicate" preformatted>
                    {result.compiledAllowPredicate || '-'}
                  </DetailBlock>

                  <DetailBlock label="Compiled Deny Predicate" preformatted>
                    {result.compiledDenyPredicate || '-'}
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
