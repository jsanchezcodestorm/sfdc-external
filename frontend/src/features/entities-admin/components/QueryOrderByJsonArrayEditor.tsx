import { useId } from 'react'

type QueryOrderByJsonArrayEditorProps = {
  value: string
  onChange: (value: string) => void
  availableFields: string[]
}

type OrderByRow = {
  field: string
  direction: 'ASC' | 'DESC'
}

type ParseResult = {
  rows: OrderByRow[]
  error: string | null
}

export function QueryOrderByJsonArrayEditor({
  value,
  onChange,
  availableFields,
}: QueryOrderByJsonArrayEditorProps) {
  const fieldListId = useId()
  const fieldOptions = availableFields
    .map((field) => field.trim())
    .filter((field) => field.length > 0)
  const { rows, error } = parseOrderByRows(value)

  const emitRows = (nextRows: OrderByRow[]) => {
    const payload = nextRows
      .map((row) => {
        const field = row.field.trim()
        if (field.length === 0) {
          return null
        }

        return {
          field,
          direction: row.direction,
        }
      })
      .filter((entry): entry is { field: string; direction: 'ASC' | 'DESC' } => entry !== null)

    onChange(payload.length > 0 ? JSON.stringify(payload, null, 2) : '')
  }

  const addRow = () => {
    emitRows([
      ...rows,
      {
        field: '',
        direction: 'ASC',
      },
    ])
  }

  const updateRow = (index: number, patch: Partial<OrderByRow>) => {
    emitRows(
      rows.map((row, currentIndex) =>
        currentIndex === index ? { ...row, ...patch } : row,
      ),
    )
  }

  const removeRow = (index: number) => {
    emitRows(rows.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Query OrderBy
      </legend>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Ordinamenti strutturati (`field`, `direction`).
        </p>
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
        >
          Aggiungi Ordine
        </button>
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
          JSON precedente non compatibile: usa i controlli strutturati per ricrearlo.
        </p>
      ) : null}

      {fieldOptions.length > 0 ? (
        <datalist id={fieldListId}>
          {fieldOptions.map((field) => (
            <option key={field} value={field} />
          ))}
        </datalist>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">Nessun ordinamento configurato.</p>
      ) : null}

      <div className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <div
            key={`orderby-row-${index}`}
            className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[minmax(0,1fr)_180px_auto]"
          >
            <label className="text-xs font-medium text-slate-600">
              Field
              <input
                list={fieldListId}
                type="text"
                value={row.field}
                onChange={(event) => updateRow(index, { field: event.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="text-xs font-medium text-slate-600">
              Direction
              <select
                value={row.direction}
                onChange={(event) =>
                  updateRow(index, { direction: event.target.value as 'ASC' | 'DESC' })
                }
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="ASC">ASC</option>
                <option value="DESC">DESC</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => removeRow(index)}
              className="self-end rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  )
}

function parseOrderByRows(value: string): ParseResult {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { rows: [], error: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { rows: [], error: 'JSON non valido' }
  }

  if (!Array.isArray(parsed)) {
    return { rows: [], error: 'JSON non array' }
  }

  const rows = parsed
    .map((entry) => mapOrderByEntry(entry))
    .filter((entry): entry is OrderByRow => entry !== null)

  return { rows, error: null }
}

function mapOrderByEntry(entry: unknown): OrderByRow | null {
  if (!isRecord(entry)) {
    return null
  }

  const field = readOptionalString(entry.field)
  const direction = normalizeDirection(entry.direction)

  return {
    field,
    direction,
  }
}

function normalizeDirection(value: unknown): 'ASC' | 'DESC' {
  if (typeof value !== 'string') {
    return 'ASC'
  }

  return value.trim().toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
