type RouteAccessLoadingStateProps = {
  message?: string
}

export function RouteAccessLoadingState({
  message = 'Verifica accessi in corso...',
}: RouteAccessLoadingStateProps) {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl items-center justify-center px-4 py-10 text-slate-700">
      <div className="rounded-2xl border border-slate-200 bg-white/90 px-6 py-5 text-sm shadow-sm">
        {message}
      </div>
    </section>
  )
}
