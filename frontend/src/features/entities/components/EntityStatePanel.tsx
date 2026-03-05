type EntityStatePanelProps = {
  title: string
  description?: string
  tone?: 'info' | 'error'
}

export function EntityStatePanel({
  title,
  description,
  tone = 'info',
}: EntityStatePanelProps) {
  const className =
    tone === 'error'
      ? 'rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800'
      : 'rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm'

  return (
    <div className={className}>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 text-sm">{description}</p>}
    </div>
  )
}
