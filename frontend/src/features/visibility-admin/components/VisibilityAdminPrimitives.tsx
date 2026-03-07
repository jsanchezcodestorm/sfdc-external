import type { ReactNode } from 'react'

export function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </article>
  )
}

export function DetailBlock({
  label,
  children,
  preformatted = false,
}: {
  label: string
  children: ReactNode
  preformatted?: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      {preformatted ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">
          {children}
        </pre>
      ) : (
        <div className="mt-3 text-sm text-slate-700">{children}</div>
      )}
    </div>
  )
}

export function ToneBadge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'green' | 'amber' | 'rose' | 'sky'
}) {
  const className =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'rose'
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : tone === 'sky'
            ? 'border-sky-200 bg-sky-50 text-sky-800'
            : 'border-slate-200 bg-slate-100 text-slate-700'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${className}`}
    >
      {children}
    </span>
  )
}

