import { Link } from 'react-router-dom'

import {
  buildRowActions,
  formatFieldValue,
  getRecordId,
  resolveActionTarget,
  resolveDisplayFieldValue,
  toColumns,
} from '../entity-helpers'
import type { EntityAction, EntityColumn, EntityRecord } from '../entity-types'

type EntityRecordTableProps = {
  columns: Array<EntityColumn | string>
  records: EntityRecord[]
  emptyMessage: string
  baseEntityPath: string
  actions?: EntityAction[]
  onDelete?: (record: EntityRecord) => Promise<void>
}

export function EntityRecordTable({
  columns,
  records,
  emptyMessage,
  baseEntityPath,
  actions,
  onDelete,
}: EntityRecordTableProps) {
  const normalizedColumns = toColumns(columns)
  const rowActions = buildRowActions(actions)
  const hasActions = rowActions.length > 0

  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-10 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-[0.13em] text-slate-500">
              {normalizedColumns.map((column) => (
                <th key={column.field} className="border-b border-slate-200 px-4 py-3 font-semibold">
                  {column.label}
                </th>
              ))}
              {hasActions && (
                <th className="border-b border-slate-200 px-4 py-3 text-right font-semibold">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const rowId = getRecordId(record)

              return (
                <tr key={rowId || JSON.stringify(record)} className="transition hover:bg-sky-50/50">
                  {normalizedColumns.map((column) => {
                    const displayValue = resolveDisplayFieldValue(record, column.field)
                    const formattedValue = formatFieldValue(displayValue)
                    const canLinkToDetail =
                      column.field === 'Name' &&
                      rowId.length > 0 &&
                      displayValue !== null &&
                      displayValue !== undefined &&
                      String(displayValue).trim().length > 0

                    return (
                      <td
                        key={`${rowId}-${column.field}`}
                        className="border-b border-slate-100 px-4 py-3 text-slate-700"
                      >
                        {canLinkToDetail ? (
                          <Link
                            to={`${baseEntityPath}/${rowId}`}
                            className="font-medium text-sky-700 transition hover:text-sky-900 hover:underline"
                          >
                            {formattedValue}
                          </Link>
                        ) : (
                          formattedValue
                        )}
                      </td>
                    )
                  })}
                  {hasActions && (
                    <td className="border-b border-slate-100 px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {rowActions.map((action) => (
                          <EntityRowAction
                            key={`${rowId}-${action.type}-${action.label ?? action.target ?? ''}`}
                            action={action}
                            rowId={rowId}
                            baseEntityPath={baseEntityPath}
                            onDelete={onDelete}
                            record={record}
                          />
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type EntityRowActionProps = {
  action: EntityAction
  rowId: string
  baseEntityPath: string
  record: EntityRecord
  onDelete?: (record: EntityRecord) => Promise<void>
}

function EntityRowAction({ action, rowId, baseEntityPath, record, onDelete }: EntityRowActionProps) {
  if (action.type === 'edit') {
    if (!rowId) {
      return null
    }

    const target = resolveActionTarget(action, {
      baseEntityPath,
      fallbackPath: `${baseEntityPath}/${rowId}/edit`,
      record,
      rowId,
    })

    return (
      <Link
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
        to={target}
      >
        {action.label ?? 'Edit'}
      </Link>
    )
  }

  if (action.type === 'delete') {
    if (!rowId) {
      return null
    }

    return (
      <button
        type="button"
        className="rounded-md border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          if (!onDelete) {
            return
          }

          const confirmDelete = window.confirm('Confermi eliminazione del record?')
          if (!confirmDelete) {
            return
          }

          void onDelete(record)
        }}
        disabled={!onDelete}
      >
        {action.label ?? 'Delete'}
      </button>
    )
  }

  const target = resolveActionTarget(action, {
    baseEntityPath,
    fallbackPath: rowId ? `${baseEntityPath}/${rowId}` : baseEntityPath,
    record,
    rowId,
  })

  return (
    <Link
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
      to={target}
    >
      {action.label ?? 'View'}
    </Link>
  )
}
