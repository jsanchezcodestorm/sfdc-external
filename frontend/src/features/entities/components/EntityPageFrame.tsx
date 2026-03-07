import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type EntityBreadcrumb = {
  label: string
  to?: string
}

type EntityPageFrameProps = {
  title: string
  subtitle?: string
  breadcrumbs: EntityBreadcrumb[]
  actions?: ReactNode
  children: ReactNode
}

export function EntityPageFrame({
  title,
  subtitle,
  breadcrumbs,
  actions,
  children,
}: EntityPageFrameProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white/88 p-6 shadow-sm backdrop-blur-sm">
        <nav className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.to ? (
                <Link className="text-slate-600 transition hover:text-slate-900" to={item.to}>
                  {item.label}
                </Link>
              ) : (
                <span className="text-slate-800">{item.label}</span>
              )}
              {index < breadcrumbs.length - 1 && <span className="text-slate-300">/</span>}
            </span>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      {children}
    </div>
  )
}
