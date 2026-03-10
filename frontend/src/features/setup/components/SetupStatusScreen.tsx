type SetupStatusScreenProps = {
  eyebrow: string
  title: string
  description: string
  tone?: 'neutral' | 'danger'
}

export function SetupStatusScreen({
  eyebrow,
  title,
  description,
  tone = 'neutral',
}: SetupStatusScreenProps) {
  const containerClassName =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : 'border-slate-200 bg-white/90 text-slate-900'
  const eyebrowClassName =
    tone === 'danger' ? 'text-rose-700' : 'text-sky-700'
  const descriptionClassName =
    tone === 'danger' ? 'text-rose-800/90' : 'text-slate-600'

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#e0f2fe_0%,_#f8fafc_45%,_#ffffff_100%)] px-6 py-12">
      <section
        className={`mx-auto w-full max-w-2xl rounded-3xl border p-8 shadow-[0_24px_55px_-32px_rgba(15,23,42,0.45)] ${containerClassName}`}
      >
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${eyebrowClassName}`}>
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
        <p className={`mt-4 text-sm leading-6 ${descriptionClassName}`}>{description}</p>
      </section>
    </main>
  )
}
