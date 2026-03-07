export type WorkspaceSidebarMetric = {
  label: string
  value: string
}

export type WorkspaceSidebarItem = {
  id: string
  label: string
  description?: string
  meta?: string[]
  isActive?: boolean
  onSelect: () => void
}

export type WorkspaceSidebarSection = {
  id: string
  eyebrow?: string
  title: string
  description?: string
  itemCountLabel?: string
  emptyState?: string
  filter?: {
    placeholder: string
    value: string
    onChange: (value: string) => void
  }
  items: WorkspaceSidebarItem[]
}

type WorkspaceSidebarProps = {
  eyebrow?: string
  title: string
  description?: string
  metrics?: WorkspaceSidebarMetric[]
  sections: WorkspaceSidebarSection[]
}

export function WorkspaceSidebar({
  eyebrow = 'Workspace',
  title,
  description,
  metrics = [],
  sections,
}: WorkspaceSidebarProps) {
  return (
    <aside className="h-screen w-full overflow-y-auto border-r border-slate-200 bg-slate-100">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 px-4 py-4 backdrop-blur-sm">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">{title}</h2>
            {description ? (
              <p className="mt-2 text-sm leading-5 text-slate-600">{description}</p>
            ) : null}
          </div>

          {metrics.length > 0 ? (
            <dl className="grid grid-cols-1 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="bg-white px-4 py-3"
                >
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {metric.label}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-950">{metric.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      </div>

      <div className="space-y-5 px-3 py-4">
        {sections.map((section) => (
          <section
            key={section.id}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-200 px-4 py-3">
              {section.eyebrow ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {section.eyebrow}
                </p>
              ) : null}
              <div className="mt-1 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950">{section.title}</h3>
                {section.itemCountLabel ? (
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                    {section.itemCountLabel}
                  </span>
                ) : null}
              </div>
              {section.description ? (
                <p className="mt-1 text-sm leading-5 text-slate-600">{section.description}</p>
              ) : null}
              {section.filter ? (
                <input
                  type="search"
                  value={section.filter.value}
                  onChange={(event) => section.filter?.onChange(event.target.value)}
                  placeholder={section.filter.placeholder}
                  className="mt-3 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:bg-white"
                />
              ) : null}
            </div>

            <div className="flex flex-col">
              {section.items.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-500">
                  {section.emptyState ?? 'Nessun elemento disponibile.'}
                </div>
              ) : null}

              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onSelect}
                  className={`border-l-2 px-4 py-3 text-left transition ${
                    item.isActive
                      ? 'border-l-slate-950 bg-slate-100'
                      : 'border-l-transparent bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-950">{item.label}</p>
                      {item.description ? (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {item.description}
                        </p>
                      ) : null}
                    </div>

                    {item.isActive ? (
                      <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        Attivo
                      </span>
                    ) : null}
                  </div>

                  {item.meta && item.meta.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {item.meta.map((entry) => (
                        <span
                          key={entry}
                          className="text-[11px] text-slate-500"
                        >
                          {entry}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}
