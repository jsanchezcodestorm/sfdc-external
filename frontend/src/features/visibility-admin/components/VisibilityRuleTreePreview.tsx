import type { ReactNode } from 'react'

import type { VisibilityRuleNode } from '../visibility-admin-types'
import { describeVisibilityScalar } from '../visibility-admin-utils'

export function VisibilityRuleTreePreview({
  node,
  depth = 0,
}: {
  node: VisibilityRuleNode
  depth?: number
}) {
  if ('all' in node) {
    return (
      <RuleGroupCard label="ALL" depth={depth}>
        <div className="space-y-3">
          {node.all.map((child, index) => (
            <VisibilityRuleTreePreview
              key={`all-${depth}-${index}`}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      </RuleGroupCard>
    )
  }

  if ('any' in node) {
    return (
      <RuleGroupCard label="ANY" depth={depth}>
        <div className="space-y-3">
          {node.any.map((child, index) => (
            <VisibilityRuleTreePreview
              key={`any-${depth}-${index}`}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      </RuleGroupCard>
    )
  }

  if ('not' in node) {
    return (
      <RuleGroupCard label="NOT" depth={depth}>
        <VisibilityRuleTreePreview node={node.not} depth={depth + 1} />
      </RuleGroupCard>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        Predicate
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-800">
        <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">{node.field}</code>
        <span className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
          {node.op}
        </span>
        {'value' in node ? (
          Array.isArray(node.value) ? (
            node.value.length > 0 ? (
              node.value.map((entry, index) => (
                <span
                  key={`${node.field}-${node.op}-${index}`}
                  className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800"
                >
                  {describeVisibilityScalar(entry)}
                </span>
              ))
            ) : (
              <span className="text-slate-400">[]</span>
            )
          ) : (
            <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">
              {describeVisibilityScalar(node.value ?? null)}
            </code>
          )
        ) : (
          <span className="text-slate-400">No value</span>
        )}
      </div>
    </div>
  )
}

function RuleGroupCard({
  label,
  depth,
  children,
}: {
  label: string
  depth: number
  children: ReactNode
}) {
  const tone =
    depth % 3 === 0
      ? 'border-slate-200 bg-slate-50'
      : depth % 3 === 1
        ? 'border-sky-200 bg-sky-50/50'
        : 'border-amber-200 bg-amber-50/50'

  return (
    <div className={`rounded-2xl border px-4 py-4 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}
