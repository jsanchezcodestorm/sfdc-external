import { useState } from 'react'

type RowActionsJsonArrayEditorProps = {
  value: string
  onChange: (value: string) => void
  legend?: string
  description?: string
  addLabel?: string
  emptyMessage?: string
}

type RowActionType = '' | 'edit' | 'delete' | 'link'

type RowActionDraft = {
  type: RowActionType
  label: string
  target: string
  entityId: string
}

type ParseResult = {
  rows: RowActionDraft[]
  error: string | null
}

export function RowActionsJsonArrayEditor({
  value,
  onChange,
  legend = 'Row Actions',
  description = 'Azioni riga strutturate (`type`, `label`, `target`, `entityId`).',
  addLabel = 'Aggiungi Action',
  emptyMessage = 'Nessuna row action configurata.',
}: RowActionsJsonArrayEditorProps) {
  return (
    <RowActionsJsonArrayEditorBody
      key={value}
      value={value}
      onChange={onChange}
      legend={legend}
      description={description}
      addLabel={addLabel}
      emptyMessage={emptyMessage}
    />
  )
}

function RowActionsJsonArrayEditorBody({
  value,
  onChange,
  legend = 'Row Actions',
  description = 'Azioni riga strutturate (`type`, `label`, `target`, `entityId`).',
  addLabel = 'Aggiungi Action',
  emptyMessage = 'Nessuna row action configurata.',
}: RowActionsJsonArrayEditorProps) {
  const [rows, setRows] = useState<RowActionDraft[]>(() => parseRowActions(value).rows)
  const { error } = parseRowActions(value)

  const emitRows = (nextRows: RowActionDraft[]) => {
    const serialized = serializeRowActions(nextRows)
    setRows(nextRows)
    onChange(serialized)
  }

  const addRow = () => {
    emitRows([
      ...rows,
      {
        type: '',
        label: '',
        target: '',
        entityId: '',
      },
    ])
  }

  const updateRow = (index: number, patch: Partial<RowActionDraft>) => {
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
        {legend}
      </legend>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{description}</p>
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
        >
          {addLabel}
        </button>
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
          JSON precedente non compatibile: usa i controlli strutturati per ricrearlo.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">{emptyMessage}</p>
      ) : null}

      <div className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <div
            key={`row-action-${index}`}
            className="rounded-lg border border-slate-200 bg-slate-50 p-2"
          >
            <div className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="text-xs font-medium text-slate-600">
                Type
                <select
                  value={row.type}
                  onChange={(event) =>
                    updateRow(index, {
                      type: event.target.value as RowActionType,
                    })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">None</option>
                  <option value="link">link</option>
                  <option value="edit">edit</option>
                  <option value="delete">delete</option>
                </select>
              </label>

              <label className="text-xs font-medium text-slate-600">
                Label
                <input
                  type="text"
                  value={row.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-xs font-medium text-slate-600">
                Target
                <input
                  type="text"
                  value={row.target}
                  onChange={(event) => updateRow(index, { target: event.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="text-xs font-medium text-slate-600">
                Entity Id
                <input
                  type="text"
                  value={row.entityId}
                  onChange={(event) => updateRow(index, { entityId: event.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <button
                type="button"
                onClick={() => removeRow(index)}
                className="self-end rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  )
}

function parseRowActions(value: string): ParseResult {
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
    .map((entry) => mapRowActionEntry(entry))
    .filter((entry): entry is RowActionDraft => entry !== null)

  return { rows, error: null }
}

function serializeRowActions(rows: RowActionDraft[]): string {
  const payload = rows
    .map((row) => {
      const type = normalizeActionType(row.type)
      const label = row.label.trim()
      const target = row.target.trim()
      const entityId = row.entityId.trim()
      const hasAnyValue =
        type.length > 0 || label.length > 0 || target.length > 0 || entityId.length > 0

      if (!hasAnyValue) {
        return null
      }

      return {
        ...(type ? { type } : {}),
        ...(label ? { label } : {}),
        ...(target ? { target } : {}),
        ...(entityId ? { entityId } : {}),
      }
    })
    .filter((entry) => entry !== null)

  return payload.length > 0 ? JSON.stringify(payload, null, 2) : ''
}

function mapRowActionEntry(entry: unknown): RowActionDraft | null {
  if (!isRecord(entry)) {
    return null
  }

  return {
    type: normalizeActionType(entry.type),
    label: readOptionalString(entry.label),
    target: readOptionalString(entry.target),
    entityId: readOptionalString(entry.entityId),
  }
}

function normalizeActionType(value: unknown): RowActionType {
  if (typeof value !== 'string') {
    return ''
  }

  if (value === 'edit' || value === 'delete' || value === 'link') {
    return value
  }

  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
