import { Link } from 'react-router-dom'

export type WorkspaceSidebarItem = {
  id: string
  label: string
  to?: string
  caption?: string
  isActive?: boolean
  isDisabled?: boolean
}

export type WorkspaceSidebarModule = {
  id: string
  label: string
  to: string
  description?: string
  isActive?: boolean
  items: WorkspaceSidebarItem[]
}

type WorkspaceSidebarProps = {
  eyebrow?: string
  title: string
  description?: string
  modules: WorkspaceSidebarModule[]
  onNavigate?: () => void
}

export function WorkspaceSidebar({
  eyebrow = 'Workspace',
  title,
  description,
  modules,
  onNavigate,
}: WorkspaceSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-slate-200 bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-base font-semibold text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-5 text-slate-600">{description}</p>
        ) : null}
      </div>

      <nav
        aria-label={`${title} navigation`}
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        <div className="space-y-2.5">
          {modules.map((module) => (
            <section
              key={module.id}
              className={`rounded-2xl border px-3 py-3 shadow-sm transition ${
                module.isActive
                  ? 'border-slate-900/10 bg-white'
                  : 'border-slate-200 bg-white/85'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={module.to}
                    onClick={onNavigate}
                    className={`text-sm font-semibold transition ${
                      module.isActive
                        ? 'text-slate-950'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    {module.label}
                  </Link>
                  {module.isActive && module.description ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">{module.description}</p>
                  ) : null}
                </div>

                {module.isActive ? (
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                    Attivo
                  </span>
                ) : null}
              </div>

              {module.isActive && module.items.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3">
                  {module.items.map((item) => (
                    <li key={item.id}>
                      {item.to && !item.isDisabled ? (
                        <Link
                          to={item.to}
                          onClick={onNavigate}
                          className={`block rounded-xl px-3 py-2 transition ${
                            item.isActive
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                          }`}
                        >
                          <span className="block text-sm font-medium">{item.label}</span>
                          {item.caption ? (
                            <span
                              className={`mt-1 block text-xs leading-5 ${
                                item.isActive ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {item.caption}
                            </span>
                          ) : null}
                        </Link>
                      ) : (
                        <div className="rounded-xl px-3 py-2 text-slate-400">
                          <span className="block text-sm font-medium">{item.label}</span>
                          {item.caption ? (
                            <span className="mt-1 block text-xs leading-5 text-slate-400">
                              {item.caption}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </nav>
    </aside>
  )
}
