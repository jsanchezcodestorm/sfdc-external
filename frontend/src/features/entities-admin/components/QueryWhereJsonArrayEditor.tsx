type QueryWhereJsonArrayEditorProps = {
  value: string
  onChange: (value: string) => void
  availableFields: string[]
}

type ValueType = 'string' | 'number' | 'boolean' | 'null' | 'array'

type WhereConditionDraft = {
  field: string
  operator: string
  valueType: ValueType
  valueText: string
  valueBoolean: boolean
  parentRel: string
}

type ParseResult = {
  rows: WhereConditionDraft[]
  error: string | null
}

const OPERATOR_OPTIONS = ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN', 'NOT IN']

export function QueryWhereJsonArrayEditor({
  value,
  onChange,
  availableFields,
}: QueryWhereJsonArrayEditorProps) {
  const fieldOptions = availableFields
    .map((field) => field.trim())
    .filter((field) => field.length > 0)
  const fieldListId = 'query-where-field-options'
  const { rows, error } = parseWhereConditions(value)

  const emitRows = (nextRows: WhereConditionDraft[]) => {
    const serialized = serializeWhereConditions(nextRows)
    onChange(serialized)
  }

  const addRow = () => {
    emitRows([
      ...rows,
      {
        field: '',
        operator: '=',
        valueType: 'string',
        valueText: '',
        valueBoolean: false,
        parentRel: '',
      },
    ])
  }

  const removeRow = (index: number) => {
    emitRows(rows.filter((_, currentIndex) => currentIndex !== index))
  }

  const updateRow = (index: number, patch: Partial<WhereConditionDraft>) => {
    emitRows(
      rows.map((row, currentIndex) =>
        currentIndex === index ? { ...row, ...patch } : row,
      ),
    )
  }

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Query Where
      </legend>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Condizioni filtro strutturate (`field`, `operator`, `value`, `parentRel`).
        </p>
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
        >
          Aggiungi Condizione
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
        <p className="mt-3 text-xs text-slate-400">Nessuna condizione configurata.</p>
      ) : null}

      <div className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <div
            key={`where-row-${index}`}
            className="rounded-lg border border-slate-200 bg-slate-50 p-2"
          >
            <div className="grid gap-2 md:grid-cols-5">
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
                Operator
                <select
                  value={row.operator}
                  onChange={(event) => updateRow(index, { operator: event.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  {OPERATOR_OPTIONS.map((operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-medium text-slate-600">
                Value Type
                <select
                  value={row.valueType}
                  onChange={(event) =>
                    updateRow(index, { valueType: event.target.value as ValueType })
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="null">null</option>
                  <option value="array">array</option>
                </select>
              </label>

              <div className="text-xs font-medium text-slate-600">
                Value
                {row.valueType === 'boolean' ? (
                  <select
                    value={row.valueBoolean ? 'true' : 'false'}
                    onChange={(event) =>
                      updateRow(index, { valueBoolean: event.target.value === 'true' })
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : row.valueType === 'null' ? (
                  <div className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-500">
                    null
                  </div>
                ) : (
                  <input
                    type="text"
                    value={row.valueText}
                    onChange={(event) => updateRow(index, { valueText: event.target.value })}
                    placeholder={row.valueType === 'array' ? 'es: Open, Closed, true, 10' : 'Value'}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                )}
              </div>

              <label className="text-xs font-medium text-slate-600">
                Parent Rel (opt)
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={row.parentRel}
                    onChange={(event) => updateRow(index, { parentRel: event.target.value })}
                    className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="shrink-0 rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
                  >
                    Remove
                  </button>
                </div>
              </label>
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  )
}

function parseWhereConditions(value: string): ParseResult {
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
    .map((entry) => mapWhereEntryToDraft(entry))
    .filter((entry): entry is WhereConditionDraft => entry !== null)

  return { rows, error: null }
}

function mapWhereEntryToDraft(entry: unknown): WhereConditionDraft | null {
  if (!isRecord(entry)) {
    return null
  }

  const field = readOptionalString(entry.field)
  const operator = readOptionalString(entry.operator) || '='
  const parentRel = readOptionalString(entry.parentRel)
  const rawValue = entry.value

  if (Array.isArray(rawValue)) {
    return {
      field,
      operator,
      parentRel,
      valueType: 'array',
      valueText: rawValue.map((item) => stringifyArrayToken(item)).join(', '),
      valueBoolean: false,
    }
  }

  if (rawValue === null) {
    return {
      field,
      operator,
      parentRel,
      valueType: 'null',
      valueText: '',
      valueBoolean: false,
    }
  }

  if (typeof rawValue === 'boolean') {
    return {
      field,
      operator,
      parentRel,
      valueType: 'boolean',
      valueText: '',
      valueBoolean: rawValue,
    }
  }

  if (typeof rawValue === 'number') {
    return {
      field,
      operator,
      parentRel,
      valueType: 'number',
      valueText: String(rawValue),
      valueBoolean: false,
    }
  }

  if (typeof rawValue === 'string') {
    return {
      field,
      operator,
      parentRel,
      valueType: 'string',
      valueText: rawValue,
      valueBoolean: false,
    }
  }

  return {
    field,
    operator,
    parentRel,
    valueType: 'string',
    valueText: '',
    valueBoolean: false,
  }
}

function serializeWhereConditions(rows: WhereConditionDraft[]): string {
  const payload = rows
    .map((row) => {
      const field = row.field.trim()
      const operator = row.operator.trim()
      const parentRel = row.parentRel.trim()

      const next: Record<string, unknown> = {}
      if (field.length > 0) {
        next.field = field
      }
      if (operator.length > 0) {
        next.operator = operator
      }
      if (parentRel.length > 0) {
        next.parentRel = parentRel
      }

      if (row.valueType === 'null') {
        next.value = null
      } else if (row.valueType === 'boolean') {
        next.value = row.valueBoolean
      } else if (row.valueType === 'number') {
        const parsed = Number(row.valueText.trim())
        next.value = Number.isFinite(parsed) ? parsed : row.valueText
      } else if (row.valueType === 'array') {
        next.value = parseArrayValue(row.valueText)
      } else {
        next.value = row.valueText
      }

      return next
    })
    .filter((entry) => Object.keys(entry).length > 0)

  if (payload.length === 0) {
    return ''
  }

  return JSON.stringify(payload, null, 2)
}

function parseArrayValue(value: string): Array<string | number | boolean | null> {
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const lowerToken = token.toLowerCase()
      if (lowerToken === 'true') {
        return true
      }
      if (lowerToken === 'false') {
        return false
      }
      if (lowerToken === 'null') {
        return null
      }

      const numericToken = Number(token)
      if (Number.isFinite(numericToken) && token !== '') {
        return numericToken
      }

      return token
    })
}

function stringifyArrayToken(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
