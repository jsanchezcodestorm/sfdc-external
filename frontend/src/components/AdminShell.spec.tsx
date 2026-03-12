import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { RouteAccessContext, type RouteAccessContextValue } from '../features/route-access/route-access-context'
import { ADMIN_ENTITY_CONFIG_ROUTE_ID } from '../features/route-access/route-access-registry'

import { AdminNavigationContext } from './admin-navigation-context'
import { AdminShell } from './AdminShell'

function createRouteAccessValue(
  overrides: Partial<RouteAccessContextValue>,
): RouteAccessContextValue {
  return {
    allowedRouteIds: [],
    allowedAdminRouteIds: [],
    firstAllowedAdminRouteId: null,
    firstAllowedAdminPath: null,
    hasRoute: () => false,
    isLoading: false,
    error: null,
    ...overrides,
  }
}

function renderAdminShell(
  initialEntry: string,
  routeAccessValue: RouteAccessContextValue,
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteAccessContext.Provider value={routeAccessValue}>
        <AdminNavigationContext.Provider
          value={{
            isAdminRoute: true,
            isSidebarOpen: false,
            openSidebar: vi.fn(),
            closeSidebar: vi.fn(),
            toggleSidebar: vi.fn(),
          }}
        >
          <Routes>
            <Route path="/admin" element={<AdminShell />}>
              <Route path="apps" element={<div>Apps page</div>} />
              <Route path="auth/providers/:providerId/edit" element={<div>Auth provider edit</div>} />
              <Route path="entity-config/:entityId/edit/detail/:detailArea" element={<div>Detail page</div>} />
              <Route path="entity-config/:entityId/edit/form/:formArea" element={<div>Form page</div>} />
            </Route>
          </Routes>
        </AdminNavigationContext.Provider>
      </RouteAccessContext.Provider>
    </MemoryRouter>,
  )
}

describe('AdminShell', () => {
  it('shows only the admin modules allowed by route ACL', () => {
    renderAdminShell(
      '/admin/apps',
      createRouteAccessValue({
        allowedRouteIds: ['route:admin-apps', 'route:admin-query-templates'],
        allowedAdminRouteIds: ['route:admin-apps', 'route:admin-query-templates'],
        firstAllowedAdminRouteId: 'route:admin-apps',
        firstAllowedAdminPath: '/admin/apps',
        hasRoute: (routeId: string) =>
          routeId === 'route:admin-apps' || routeId === 'route:admin-query-templates',
      }),
    )

    expect(screen.getAllByText('Apps').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Query Templates').length).toBeGreaterThan(0)
    expect(screen.queryByText('ACL')).toBeNull()
    expect(screen.queryByText('Visibility')).toBeNull()
    expect(screen.queryByText('Audit')).toBeNull()
  })

  it('keeps detail section active on nested detail editor routes', () => {
    const { container } = renderAdminShell(
      '/admin/entity-config/account/edit/detail/sections',
      createRouteAccessValue({
        allowedRouteIds: [ADMIN_ENTITY_CONFIG_ROUTE_ID],
        allowedAdminRouteIds: [ADMIN_ENTITY_CONFIG_ROUTE_ID],
        firstAllowedAdminRouteId: ADMIN_ENTITY_CONFIG_ROUTE_ID,
        firstAllowedAdminPath: '/admin/entity-config',
        hasRoute: (routeId: string) => routeId === ADMIN_ENTITY_CONFIG_ROUTE_ID,
      }),
    )

    const detailLink = container.querySelector(
      'a[href="/admin/entity-config/account/edit/detail/header-query"]',
    )

    expect(detailLink).not.toBeNull()
    expect(detailLink?.className).toContain('bg-slate-900')
  })

  it('keeps form section active on nested form editor routes', () => {
    const { container } = renderAdminShell(
      '/admin/entity-config/account/edit/form/sections',
      createRouteAccessValue({
        allowedRouteIds: [ADMIN_ENTITY_CONFIG_ROUTE_ID],
        allowedAdminRouteIds: [ADMIN_ENTITY_CONFIG_ROUTE_ID],
        firstAllowedAdminRouteId: ADMIN_ENTITY_CONFIG_ROUTE_ID,
        firstAllowedAdminPath: '/admin/entity-config',
        hasRoute: (routeId: string) => routeId === ADMIN_ENTITY_CONFIG_ROUTE_ID,
      }),
    )

    const formLink = container.querySelector(
      'a[href="/admin/entity-config/account/edit/form/header-query"]',
    )

    expect(formLink).not.toBeNull()
    expect(formLink?.className).toContain('bg-slate-900')
  })

  it('keeps auth providers active on nested provider editor routes', () => {
    const { container } = renderAdminShell(
      '/admin/auth/providers/google/edit',
      createRouteAccessValue({
        allowedRouteIds: ['route:admin-auth'],
        allowedAdminRouteIds: ['route:admin-auth'],
        firstAllowedAdminRouteId: 'route:admin-auth',
        firstAllowedAdminPath: '/admin/auth/providers',
        hasRoute: (routeId: string) => routeId === 'route:admin-auth',
      }),
    )

    const providerLinks = Array.from(
      container.querySelectorAll('a[href="/admin/auth/providers"]'),
    )

    expect(providerLinks.length).toBeGreaterThan(0)
    expect(
      providerLinks.some((link) => link.className.includes('bg-slate-900')),
    ).toBe(true)
  })
})
