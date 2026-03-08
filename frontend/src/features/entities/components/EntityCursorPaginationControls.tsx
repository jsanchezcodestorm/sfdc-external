type EntityCursorPaginationControlsProps = {
  canGoPrevious: boolean
  hasNextPage: boolean
  onPrevious: () => void
  onNext: () => void
  total?: number
}

export function EntityCursorPaginationControls({
  canGoPrevious,
  hasNextPage,
  onPrevious,
  onNext,
  total,
}: EntityCursorPaginationControlsProps) {
  if (!canGoPrevious && !hasNextPage) {
    return null
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-600">
        {typeof total === 'number' ? `Totale record: ${total}` : 'Paginazione cursor-based'}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onPrevious}
          disabled={!canGoPrevious}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onNext}
          disabled={!hasNextPage}
        >
          Next
        </button>
      </div>
    </section>
  )
}
