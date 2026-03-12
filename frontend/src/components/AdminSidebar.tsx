import { Link } from 'react-router-dom'

export type AdminSidebarItem = {
  id: string
  label: string
  to?: string
  caption?: string
  isActive?: boolean
  isDisabled?: boolean
}

export type AdminSidebarModule = {
  id: string
  label: string
  to: string
  description?: string
  isActive?: boolean
  items: AdminSidebarItem[]
}

export type AdminSidebarSection = {
  id: string
  label: string
  modules: AdminSidebarModule[]
}

type AdminSidebarProps = {
  eyebrow?: string
  title: string
  description?: string
  sections: AdminSidebarSection[]
  onNavigate?: () => void
}

export function AdminSidebar({
  eyebrow = 'Admin',
  title,
  description,
  sections,
  onNavigate,
}: AdminSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-slate-200 bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900 shadow-[12px_0_30px_-24px_rgba(15,23,42,0.16)]">
      <div className="border-b border-slate-200/90 bg-white/75 px-4 py-5 backdrop-blur-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-5 text-slate-600">{description}</p>
        ) : null}
      </div>

      <nav aria-label={`${title} navigation`} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.id}>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {section.label}
              </p>

              <ul className="mt-2 space-y-1.5">
                {section.modules.map((module) => {
                  const hasChildNavigation = module.items.length > 0
                  const showChildNavigation = Boolean(module.isActive) && hasChildNavigation

                  return (
                    <li key={module.id}>
                      <Link
                        to={module.to}
                        onClick={onNavigate}
                        aria-current={module.isActive && !hasChildNavigation ? 'page' : undefined}
                        className={`group relative block rounded-xl px-4 py-3 transition ${
                          module.isActive
                            ? 'bg-white text-slate-950 shadow-[inset_0_0_0_1px_rgba(186,230,253,0.95),0_10px_24px_-20px_rgba(15,23,42,0.35)]'
                            : 'text-slate-700 hover:bg-white/80 hover:text-slate-950'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-2.5 left-0 top-2.5 w-0.5 rounded-full transition ${
                            module.isActive ? 'bg-sky-600' : 'bg-transparent group-hover:bg-slate-300'
                          }`}
                        />
                        <span className="block text-sm font-semibold">{module.label}</span>
                        {module.isActive && module.description ? (
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {module.description}
                          </span>
                        ) : null}
                      </Link>

                      {showChildNavigation ? (
                        <ul className="mt-1.5 space-y-1 pl-3">
                          {module.items.map((item) => (
                            <li key={item.id}>
                              {item.to && !item.isDisabled ? (
                                <Link
                                  to={item.to}
                                  onClick={onNavigate}
                                  aria-current={item.isActive ? 'page' : undefined}
                                  className={`block rounded-lg px-4 py-2.5 transition ${
                                    item.isActive
                                      ? 'bg-sky-50 text-sky-950 shadow-[inset_0_0_0_1px_rgba(186,230,253,1)]'
                                      : 'text-slate-700 hover:bg-white/80 hover:text-slate-950'
                                  }`}
                                >
                                  <span className="block text-sm font-medium">{item.label}</span>
                                  {item.caption ? (
                                    <span
                                      className={`mt-1 block text-xs leading-5 ${
                                        item.isActive ? 'text-sky-700' : 'text-slate-500'
                                      }`}
                                    >
                                      {item.caption}
                                    </span>
                                  ) : null}
                                </Link>
                              ) : (
                                <div
                                  aria-disabled="true"
                                  className="rounded-lg px-4 py-2.5 text-slate-400"
                                >
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
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </nav>
    </aside>
  )
}
