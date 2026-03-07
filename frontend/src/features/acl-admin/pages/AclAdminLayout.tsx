import { Outlet } from 'react-router-dom'

export function AclAdminLayout() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Admin
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">ACL PostgreSQL</h1>
        <p className="mt-2 text-sm text-slate-600">
          Catalogo permessi, defaults, assegnazioni dirette ai Contact e risorse ACL con workflow
          admin dedicato.
        </p>
      </header>
      <Outlet />
    </div>
  )
}
