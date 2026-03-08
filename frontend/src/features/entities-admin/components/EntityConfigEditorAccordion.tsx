import type { ReactNode } from 'react'

export type EntityConfigEditorAccordionItem = {
  id: string
  label: string
  title: string
  description?: string
  content: ReactNode
}

type EntityConfigEditorAccordionProps = {
  items: EntityConfigEditorAccordionItem[]
  activeItemId: string
  navigationLabel: string
  onItemSelect: (itemId: string) => void
}

export function EntityConfigEditorAccordion({
  items,
  activeItemId,
  navigationLabel,
  onItemSelect,
}: EntityConfigEditorAccordionProps) {
  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0] ?? null

  if (!activeItem) {
    return null
  }

  const panelId = `entity-config-editor-panel-${activeItem.id}`

  return (
    <div className="space-y-4">
      <nav
        aria-label={navigationLabel}
        className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
      >
        <div role="tablist" aria-label={navigationLabel} className="flex min-w-max gap-2">
          {items.map((item) => {
            const isActive = item.id === activeItemId

            return (
              <button
                key={`tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`entity-config-editor-panel-${item.id}`}
                aria-label={`Vai alla tab ${item.title}`}
                onClick={() => onItemSelect(item.id)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

      <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm ring-2 ring-sky-100">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {activeItem.label}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{activeItem.title}</h2>
          {activeItem.description ? (
            <p className="mt-1 text-sm text-slate-500">{activeItem.description}</p>
          ) : null}
        </div>

        <div id={panelId} role="tabpanel" className="px-5 pb-5 pt-5">
          {activeItem.content}
        </div>
      </section>
    </div>
  )
}
