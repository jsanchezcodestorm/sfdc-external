import { SalesforceFieldSingleInput } from '../../entities-admin/components/SalesforceFieldSingleInput'
import type {
  VisibilityPredicateNode,
  VisibilityPredicateOperator,
  VisibilityRuleNode,
  VisibilityScalar,
} from '../visibility-admin-types'
import {
  createRuleNodeByKind,
  describeVisibilityScalar,
} from '../visibility-admin-utils'

const OPERATOR_OPTIONS: VisibilityPredicateOperator[] = [
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'IN',
  'NOT IN',
  'LIKE',
  'STARTS_WITH',
  'CONTAINS',
  'IS_NULL',
  'IS_NOT_NULL',
]

type RuleNodeKind = 'predicate' | 'all' | 'any' | 'not'
type ScalarMode = 'string' | 'number' | 'boolean' | 'null'

export function VisibilityRuleBuilder({
  node,
  objectApiName,
  onChange,
  onRemove,
  depth = 0,
}: {
  node: VisibilityRuleNode
  objectApiName: string
  onChange: (node: VisibilityRuleNode) => void
  onRemove?: () => void
  depth?: number
}) {
  const nodeKind = getRuleNodeKind(node)

  const switchNodeKind = (nextKind: RuleNodeKind) => {
    onChange(createRuleNodeByKind(nextKind))
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Rule Node
          </p>
          <p className="mt-1 text-sm text-slate-600">Depth {depth + 1}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={nodeKind}
            onChange={(event) => switchNodeKind(event.target.value as RuleNodeKind)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            <option value="predicate">Predicate</option>
            <option value="all">All group</option>
            <option value="any">Any group</option>
            <option value="not">Not group</option>
          </select>

          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              Rimuovi nodo
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {nodeKind === 'predicate' ? (
          <PredicateEditor
            node={node as VisibilityPredicateNode}
            objectApiName={objectApiName}
            onChange={(nextNode) => onChange(nextNode)}
          />
        ) : null}

        {isAllNode(node) ? (
          <RuleGroupEditor
            kind="all"
            objectApiName={objectApiName}
            items={node.all}
            onChange={(items) => onChange({ all: items })}
            depth={depth}
          />
        ) : null}

        {isAnyNode(node) ? (
          <RuleGroupEditor
            kind="any"
            objectApiName={objectApiName}
            items={node.any}
            onChange={(items) => onChange({ any: items })}
            depth={depth}
          />
        ) : null}

        {isNotNode(node) ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Il gruppo <code className="font-mono text-xs">NOT</code> contiene un solo figlio.
            </p>
            <VisibilityRuleBuilder
              node={node.not}
              objectApiName={objectApiName}
              onChange={(nextNode) => onChange({ not: nextNode })}
              depth={depth + 1}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PredicateEditor({
  node,
  objectApiName,
  onChange,
}: {
  node: VisibilityPredicateNode
  objectApiName: string
  onChange: (node: VisibilityPredicateNode) => void
}) {
  const scalarMode = detectScalarMode(node.value)
  const arrayMode = detectArrayMode(node.value)
  const isArrayOperator = node.op === 'IN' || node.op === 'NOT IN'
  const isNullOperator = node.op === 'IS_NULL' || node.op === 'IS_NOT_NULL'

  const setOperator = (operator: VisibilityPredicateOperator) => {
    if (operator === 'IS_NULL' || operator === 'IS_NOT_NULL') {
      onChange({
        field: node.field,
        op: operator,
      })
      return
    }

    if (operator === 'IN' || operator === 'NOT IN') {
      const nextValues =
        Array.isArray(node.value) && node.value.length > 0 ? node.value : ['']
      onChange({
        field: node.field,
        op: operator,
        value: nextValues,
      })
      return
    }

    onChange({
      field: node.field,
      op: operator,
      value: Array.isArray(node.value) ? node.value[0] ?? '' : (node.value ?? ''),
    })
  }

  const scalarValue = Array.isArray(node.value) ? node.value[0] ?? '' : (node.value ?? '')
  const arrayValue = Array.isArray(node.value) ? node.value : []

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SalesforceFieldSingleInput
          label="Field"
          objectApiName={objectApiName}
          value={node.field}
          onChange={(field) => onChange({ ...node, field })}
          helperText="Usa l'Object API Name sopra per abilitare autocomplete dei campi Salesforce."
        />

        <label className="text-sm font-medium text-slate-700">
          Operatore
          <select
            value={node.op}
            onChange={(event) => setOperator(event.target.value as VisibilityPredicateOperator)}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            {OPERATOR_OPTIONS.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isNullOperator ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Questo operatore non richiede un valore.
        </p>
      ) : null}

      {!isNullOperator && isArrayOperator ? (
        <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="text-sm font-medium text-slate-700">
            Value type
            <select
              value={arrayMode}
              onChange={(event) =>
                onChange({
                  ...node,
                  value: castArrayValues(arrayValue, event.target.value as ScalarMode),
                })
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="null">null</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Values
            <textarea
              rows={4}
              value={serializeArrayValues(arrayValue)}
              onChange={(event) =>
                onChange({
                  ...node,
                  value: parseArrayValues(event.target.value, arrayMode),
                })
              }
              placeholder="Uno per riga oppure separati da virgola"
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>
      ) : null}

      {!isNullOperator && !isArrayOperator ? (
        <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="text-sm font-medium text-slate-700">
            Value type
            <select
              value={scalarMode}
              onChange={(event) =>
                onChange({
                  ...node,
                  value: castScalarValue(scalarValue, event.target.value as ScalarMode),
                })
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="null">null</option>
            </select>
          </label>

          {scalarMode === 'boolean' ? (
            <label className="text-sm font-medium text-slate-700">
              Value
              <select
                value={scalarValue === true ? 'true' : 'false'}
                onChange={(event) =>
                  onChange({
                    ...node,
                    value: event.target.value === 'true',
                  })
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          ) : scalarMode === 'null' ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
              Il valore corrente sara <code className="font-mono text-xs">null</code>.
            </div>
          ) : (
            <label className="text-sm font-medium text-slate-700">
              Value
              <input
                type={scalarMode === 'number' ? 'number' : 'text'}
                value={scalarMode === 'number' && typeof scalarValue === 'number' ? scalarValue : scalarMode === 'string' ? String(scalarValue ?? '') : describeVisibilityScalar(scalarValue)}
                onChange={(event) =>
                  onChange({
                    ...node,
                    value:
                      scalarMode === 'number'
                        ? Number(event.target.value)
                        : event.target.value,
                  })
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
          )}
        </div>
      ) : null}
    </div>
  )
}

function RuleGroupEditor({
  kind,
  objectApiName,
  items,
  onChange,
  depth,
}: {
  kind: 'all' | 'any'
  objectApiName: string
  items: VisibilityRuleNode[]
  onChange: (items: VisibilityRuleNode[]) => void
  depth: number
}) {
  const updateItem = (index: number, nextItem: VisibilityRuleNode) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? nextItem : item)))
  }

  const removeItem = (index: number) => {
    if (items.length === 1) {
      onChange([createRuleNodeByKind('predicate')])
      return
    }

    onChange(items.filter((_, itemIndex) => itemIndex !== index))
  }

  const addItem = (nodeKind: RuleNodeKind) => {
    onChange([...items, createRuleNodeByKind(nodeKind)])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => addItem('predicate')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          Add predicate
        </button>
        <button
          type="button"
          onClick={() => addItem('all')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          Add all group
        </button>
        <button
          type="button"
          onClick={() => addItem('any')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          Add any group
        </button>
        <button
          type="button"
          onClick={() => addItem('not')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          Add not group
        </button>
      </div>

      <div className="space-y-4">
        {items.map((child, index) => (
          <VisibilityRuleBuilder
            key={`${kind}-${depth}-${index}`}
            node={child}
            objectApiName={objectApiName}
            onChange={(nextNode) => updateItem(index, nextNode)}
            onRemove={() => removeItem(index)}
            depth={depth + 1}
          />
        ))}
      </div>
    </div>
  )
}

function getRuleNodeKind(node: VisibilityRuleNode): RuleNodeKind {
  if (isAllNode(node)) {
    return 'all'
  }

  if (isAnyNode(node)) {
    return 'any'
  }

  if (isNotNode(node)) {
    return 'not'
  }

  return 'predicate'
}

function isAllNode(node: VisibilityRuleNode): node is { all: VisibilityRuleNode[] } {
  return 'all' in node
}

function isAnyNode(node: VisibilityRuleNode): node is { any: VisibilityRuleNode[] } {
  return 'any' in node
}

function isNotNode(node: VisibilityRuleNode): node is { not: VisibilityRuleNode } {
  return 'not' in node
}

function detectScalarMode(value: VisibilityPredicateNode['value']): ScalarMode {
  if (Array.isArray(value)) {
    return detectScalarMode(value[0])
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  return 'string'
}

function detectArrayMode(value: VisibilityPredicateNode['value']): ScalarMode {
  if (!Array.isArray(value) || value.length === 0) {
    return 'string'
  }

  return detectScalarMode(value[0])
}

function castScalarValue(value: VisibilityScalar, mode: ScalarMode): VisibilityScalar {
  if (mode === 'null') {
    return null
  }

  if (mode === 'boolean') {
    return value === false ? false : true
  }

  if (mode === 'number') {
    const numericValue =
      typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'))
    return Number.isFinite(numericValue) ? numericValue : 0
  }

  return value === null ? '' : String(value)
}

function castArrayValues(values: VisibilityScalar[], mode: ScalarMode): VisibilityScalar[] {
  if (mode === 'null') {
    return values.length > 0 ? values.map(() => null) : [null]
  }

  if (mode === 'boolean') {
    return values.length > 0
      ? values.map((entry) => String(entry).trim().toLowerCase() === 'true')
      : [true]
  }

  if (mode === 'number') {
    return values.length > 0
      ? values.map((entry) => {
          const numericValue = Number.parseFloat(String(entry))
          return Number.isFinite(numericValue) ? numericValue : 0
        })
      : [0]
  }

  return values.length > 0 ? values.map((entry) => String(entry ?? '')) : ['']
}

function parseArrayValues(value: string, mode: ScalarMode): VisibilityScalar[] {
  const rawItems = value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (rawItems.length === 0) {
    return []
  }

  if (mode === 'null') {
    return rawItems.map(() => null)
  }

  if (mode === 'boolean') {
    return rawItems.map((entry) => entry.toLowerCase() === 'true')
  }

  if (mode === 'number') {
    return rawItems.map((entry) => {
      const numericValue = Number.parseFloat(entry)
      return Number.isFinite(numericValue) ? numericValue : 0
    })
  }

  return rawItems
}

function serializeArrayValues(values: VisibilityScalar[]): string {
  return values.map((entry) => describeVisibilityScalar(entry)).join('\n')
}
