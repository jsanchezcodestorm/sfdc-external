import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../features/auth/auth-context'
import { RouteAccessContext, type RouteAccessContextValue } from '../features/route-access/route-access-context'
import { SetupContext, type SetupContextValue } from '../features/setup/setup-context'

import { AdminNavigationContext } from './admin-navigation-context'
import { AppTopBar } from './AppTopBar'
import { RuntimeNavigationContext } from './runtime-navigation-context'

function createAuthValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    isBootstrapping: false,
    async loginWithGoogleIdToken() {},
    async logout() {},
    ...overrides,
  }
}

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

function createSetupValue(overrides: Partial<SetupContextValue>): SetupContextValue {
  return {
    status: {
      state: 'completed',
      siteName: 'Acme Portal',
      googleConfigMode: 'env',
    },
    brandName: 'Acme Portal',
    isLoading: false,
    error: null,
    async refreshStatus() {
      return {
        state: 'completed',
        siteName: 'Acme Portal',
        googleConfigMode: 'env',
      }
    },
    ...overrides,
  }
}

describe('AppTopBar', () => {
  it('shows the admin CTA only when an admin route is allowed and points to the first allowed path', () => {
    render(
      <MemoryRouter>
        <SetupContext.Provider value={createSetupValue({})}>
          <AuthContext.Provider
            value={createAuthValue({
              user: {
                sub: '003000000000020',
                email: 'topbar@example.com',
                permissions: ['PORTAL_ADMIN'],
              },
            })}
          >
            <RouteAccessContext.Provider
              value={createRouteAccessValue({
                allowedRouteIds: ['route:admin-apps'],
                allowedAdminRouteIds: ['route:admin-apps'],
                firstAllowedAdminRouteId: 'route:admin-apps',
                firstAllowedAdminPath: '/admin/apps',
                hasRoute: (routeId: string) => routeId === 'route:admin-apps',
              })}
            >
              <AdminNavigationContext.Provider
                value={{
                  isAdminRoute: false,
                  isSidebarOpen: false,
                  openSidebar: vi.fn(),
                  closeSidebar: vi.fn(),
                  toggleSidebar: vi.fn(),
                }}
              >
                <RuntimeNavigationContext.Provider
                  value={{
                    isRuntimeRoute: false,
                    isDrawerOpen: false,
                    openDrawer: vi.fn(),
                    closeDrawer: vi.fn(),
                    toggleDrawer: vi.fn(),
                  }}
                >
                  <AppTopBar />
                </RuntimeNavigationContext.Provider>
              </AdminNavigationContext.Provider>
            </RouteAccessContext.Provider>
          </AuthContext.Provider>
        </SetupContext.Provider>
      </MemoryRouter>,
    )

    const adminLink = screen.getByText('Admin Config')
    expect(adminLink.getAttribute('href')).toBe('/admin/apps')
  })

  it('hides the admin CTA when no admin route is allowed', () => {
    render(
      <MemoryRouter>
        <SetupContext.Provider value={createSetupValue({})}>
          <AuthContext.Provider
            value={createAuthValue({
              user: {
                sub: '003000000000021',
                email: 'noadmin@example.com',
                permissions: ['PORTAL_USER'],
              },
            })}
          >
            <RouteAccessContext.Provider value={createRouteAccessValue({})}>
              <AdminNavigationContext.Provider
                value={{
                  isAdminRoute: false,
                  isSidebarOpen: false,
                  openSidebar: vi.fn(),
                  closeSidebar: vi.fn(),
                  toggleSidebar: vi.fn(),
                }}
              >
                <RuntimeNavigationContext.Provider
                  value={{
                    isRuntimeRoute: false,
                    isDrawerOpen: false,
                    openDrawer: vi.fn(),
                    closeDrawer: vi.fn(),
                    toggleDrawer: vi.fn(),
                  }}
                >
                  <AppTopBar />
                </RuntimeNavigationContext.Provider>
              </AdminNavigationContext.Provider>
            </RouteAccessContext.Provider>
          </AuthContext.Provider>
        </SetupContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.queryByText('Admin Config')).toBeNull()
  })
})
