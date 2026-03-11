import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AuthContext, type AuthContextValue } from '../../auth/auth-context'

import { RouteAccessContext, type RouteAccessContextValue } from '../route-access-context'
import {
  ADMIN_APPS_ROUTE_ID,
  HOME_ROUTE_ID,
} from '../route-access-registry'

import { AdminIndexRedirect } from './AdminIndexRedirect'
import { RequireRouteAccess } from './RequireRouteAccess'

function createAuthValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    isBootstrapping: false,
    async loginWithPassword() {},
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

function renderRouteScenario({
  authValue,
  routeAccessValue,
  initialEntry,
}: {
  authValue: AuthContextValue
  routeAccessValue: RouteAccessContextValue
  initialEntry: string
}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthContext.Provider value={authValue}>
        <RouteAccessContext.Provider value={routeAccessValue}>
          <Routes>
            <Route
              element={
                <RequireRouteAccess routeId={HOME_ROUTE_ID} allowAnonymous />
              }
            >
              <Route path="/" element={<div>Home Allowed</div>} />
            </Route>

            <Route path="/login" element={<div>Login Page</div>} />

            <Route path="/admin">
              <Route index element={<AdminIndexRedirect />} />
              <Route element={<RequireRouteAccess routeId={ADMIN_APPS_ROUTE_ID} />}>
                <Route path="apps" element={<div>Apps Allowed</div>} />
              </Route>
            </Route>
          </Routes>
        </RouteAccessContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('RequireRouteAccess', () => {
  it('allows anonymous access on home and enforces route:home for authenticated users', async () => {
    renderRouteScenario({
      authValue: createAuthValue({ user: null }),
      routeAccessValue: createRouteAccessValue({}),
      initialEntry: '/',
    })

    expect(screen.getByText('Home Allowed')).not.toBeNull()

    renderRouteScenario({
      authValue: createAuthValue({
        user: {
          sub: '003000000000010',
          email: 'home@example.com',
          permissions: ['PORTAL_USER'],
        },
      }),
      routeAccessValue: createRouteAccessValue({
        allowedRouteIds: [HOME_ROUTE_ID],
        hasRoute: (routeId: string) => routeId === HOME_ROUTE_ID,
      }),
      initialEntry: '/',
    })

    expect(screen.getAllByText('Home Allowed').length).toBeGreaterThan(0)
  })

  it('shows a deny page when an authenticated user opens a route that is not allowed', async () => {
    renderRouteScenario({
      authValue: createAuthValue({
        user: {
          sub: '003000000000011',
          email: 'limited@example.com',
          permissions: ['PORTAL_USER'],
        },
      }),
      routeAccessValue: createRouteAccessValue({
        allowedRouteIds: [HOME_ROUTE_ID],
        hasRoute: (routeId: string) => routeId === HOME_ROUTE_ID,
      }),
      initialEntry: '/admin/apps',
    })

    expect(screen.getByText('Accesso negato')).not.toBeNull()
    expect(screen.getByText('Route disponibili')).not.toBeNull()
    expect(screen.getByText('Home')).not.toBeNull()
  })

  it('redirects /admin to the first allowed admin route', async () => {
    renderRouteScenario({
      authValue: createAuthValue({
        user: {
          sub: '003000000000012',
          email: 'apps@example.com',
          permissions: ['PORTAL_ADMIN'],
        },
      }),
      routeAccessValue: createRouteAccessValue({
        allowedRouteIds: [ADMIN_APPS_ROUTE_ID],
        allowedAdminRouteIds: [ADMIN_APPS_ROUTE_ID],
        firstAllowedAdminRouteId: ADMIN_APPS_ROUTE_ID,
        firstAllowedAdminPath: '/admin/apps',
        hasRoute: (routeId: string) => routeId === ADMIN_APPS_ROUTE_ID,
      }),
      initialEntry: '/admin',
    })

    await waitFor(() => {
      expect(screen.getByText('Apps Allowed')).not.toBeNull()
    })
  })

  it('blocks access when route ACL verification fails', async () => {
    renderRouteScenario({
      authValue: createAuthValue({
        user: {
          sub: '003000000000013',
          email: 'error@example.com',
          permissions: ['PORTAL_USER'],
        },
      }),
      routeAccessValue: createRouteAccessValue({
        error: 'API 503: navigation unavailable',
        hasRoute: () => false,
      }),
      initialEntry: '/',
    })

    expect(screen.getByText('Accesso negato')).not.toBeNull()
    expect(
      screen.getByText(
        'Non e stato possibile verificare le route consentite. L accesso resta bloccato per sicurezza.',
      ),
    ).not.toBeNull()
    expect(screen.getByText('Dettaglio verifica: API 503: navigation unavailable')).not.toBeNull()
  })
})
