import { NavLink, Outlet } from 'react-router-dom'

const VISIBILITY_TABS = [
  { id: 'cones', label: 'Cones', target: '/admin/visibility/cones' },
  { id: 'rules', label: 'Rules', target: '/admin/visibility/rules' },
  { id: 'assignments', label: 'Assignments', target: '/admin/visibility/assignments' },
  { id: 'debug', label: 'Debug', target: '/admin/visibility/debug' },
]

export function VisibilityAdminLayout() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Admin
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Visibility Cones PostgreSQL</h1>
        <p className="mt-2 text-sm text-slate-600">
          Backoffice tabellare per cones, rules, assignments e debug del motore visibility runtime.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {VISIBILITY_TABS.map((tab) => (
            <NavLink
              key={tab.id}
              to={tab.target}
              className={({ isActive }) =>
                `rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </section>

      <Outlet />
    </div>
  )
}
