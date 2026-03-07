import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import {
  WorkspaceSidebar,
  type WorkspaceSidebarSection,
} from './WorkspaceSidebar'

export function AdminShell() {
  const location = useLocation()
  const navigate = useNavigate()

  const adminSections: WorkspaceSidebarSection[] = [
    {
      id: 'configuration',
      eyebrow: 'Amministrazione',
      title: 'Moduli admin',
      description: "La navigazione della colonna sinistra copre l'intero dominio /admin.",
      itemCountLabel: '4 moduli',
      items: [
        {
          id: 'entity-config',
          label: 'Entity Config',
          description: 'Gestione configurazioni entità e relativi pannelli.',
          isActive: location.pathname.startsWith('/admin/entity-config'),
          onSelect: () => {
            navigate('/admin/entity-config')
          },
        },
        {
          id: 'acl',
          label: 'ACL',
          description: 'Catalogo permessi, default permissions e risorse ACL.',
          isActive: location.pathname.startsWith('/admin/acl'),
          onSelect: () => {
            navigate('/admin/acl')
          },
        },
        {
          id: 'query-templates',
          label: 'Query Templates',
          description: 'CRUD dei template query usati dal runtime backend.',
          isActive: location.pathname.startsWith('/admin/query-templates'),
          onSelect: () => {
            navigate('/admin/query-templates')
          },
        },
        {
          id: 'visibility',
          label: 'Visibility',
          description: 'Cones, rules, assignments e debug del motore visibility.',
          isActive: location.pathname.startsWith('/admin/visibility'),
          onSelect: () => {
            navigate('/admin/visibility')
          },
        },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <div className="hidden lg:block">
        <div className="fixed left-0 top-[57px] h-[calc(100vh-57px)] w-80">
          <WorkspaceSidebar
            eyebrow="Admin"
            title="Backoffice"
            description="Navigazione globale dei moduli amministrativi PostgreSQL-backed."
            sections={adminSections}
          />
        </div>
      </div>

      <main className="min-h-screen px-4 py-6 sm:px-6 lg:pl-[21rem]">
        <Outlet />
      </main>
    </div>
  )
}
