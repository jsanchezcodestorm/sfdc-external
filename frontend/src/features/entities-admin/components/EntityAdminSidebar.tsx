import type {
  EntityAdminConfigSummary,
  EntityConfigSectionKey,
} from '../entity-admin-types'

type EntityAdminSidebarProps = {
  entities: EntityAdminConfigSummary[]
  selectedEntityId: string | null
  selectedSection: EntityConfigSectionKey
  onSelectEntity: (entityId: string) => void
  onSelectSection: (section: EntityConfigSectionKey) => void
}

const sections: Array<{ key: EntityConfigSectionKey; label: string }> = [
  { key: 'base', label: 'Base' },
  { key: 'list', label: 'List' },
  { key: 'detail', label: 'Detail' },
  { key: 'form', label: 'Form' },
]

export function EntityAdminSidebar({
  entities,
  selectedEntityId,
  selectedSection,
  onSelectEntity,
  onSelectSection,
}: EntityAdminSidebarProps) {
  return (
    <aside className="h-screen w-full overflow-y-auto border-r border-slate-200 bg-white px-4 py-5">
      <div className="space-y-6">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Category
          </p>
          <h2 className="mt-2 text-sm font-semibold text-slate-900">
            Entity PostgreSQL
          </h2>
          <div className="mt-3 flex flex-col gap-1.5">
            {entities.map((entity) => {
              const selected = entity.id === selectedEntityId
              return (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => onSelectEntity(entity.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-sky-300 bg-sky-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-medium text-slate-900">{entity.label}</p>
                  <p className="text-xs text-slate-500">
                    {entity.id} - {entity.objectApiName}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Sub Category
          </p>
          <h2 className="mt-2 text-sm font-semibold text-slate-900">
            Config Sections
          </h2>
          <div className="mt-3 flex flex-col gap-1.5">
            {sections.map((section) => {
              const selected = section.key === selectedSection
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => onSelectSection(section.key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                    selected
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {section.label}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </aside>
  )
}
