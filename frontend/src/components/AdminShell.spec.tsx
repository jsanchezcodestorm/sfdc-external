import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { RouteAccessContext, type RouteAccessContextValue } from '../features/route-access/route-access-context'

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

describe('AdminShell', () => {
  it('shows only the admin modules allowed by route ACL', () => {
    render(
      <MemoryRouter initialEntries={['/admin/apps']}>
        <RouteAccessContext.Provider
          value={createRouteAccessValue({
            allowedRouteIds: ['route:admin-apps', 'route:admin-query-templates'],
            allowedAdminRouteIds: ['route:admin-apps', 'route:admin-query-templates'],
            firstAllowedAdminRouteId: 'route:admin-apps',
            firstAllowedAdminPath: '/admin/apps',
            hasRoute: (routeId: string) =>
              routeId === 'route:admin-apps' || routeId === 'route:admin-query-templates',
          })}
        >
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
              </Route>
            </Routes>
          </AdminNavigationContext.Provider>
        </RouteAccessContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('Apps').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Query Templates').length).toBeGreaterThan(0)
    expect(screen.queryByText('ACL')).toBeNull()
    expect(screen.queryByText('Visibility')).toBeNull()
    expect(screen.queryByText('Audit')).toBeNull()
  })
})
