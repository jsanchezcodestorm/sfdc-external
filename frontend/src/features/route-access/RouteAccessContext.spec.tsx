import { render, screen, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../auth/auth-context'

import { RouteAccessProvider } from './RouteAccessContext'
import { fetchRouteAccessNavigation } from './route-access-api'
import { useRouteAccess } from './useRouteAccess'

vi.mock('./route-access-api', () => ({
  fetchRouteAccessNavigation: vi.fn(),
}))

function createAuthValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    isBootstrapping: false,
    async loginWithGoogleIdToken() {},
    async logout() {},
    ...overrides,
  }
}

function renderWithAuth(authValue: AuthContextValue, children: ReactNode) {
  return render(
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>,
  )
}

function RouteAccessProbe() {
  const {
    allowedRouteIds,
    allowedAdminRouteIds,
    firstAllowedAdminRouteId,
    firstAllowedAdminPath,
    error,
    isLoading,
  } = useRouteAccess()

  return (
    <dl>
      <dd data-testid="allowed-route-ids">{allowedRouteIds.join(',')}</dd>
      <dd data-testid="allowed-admin-route-ids">{allowedAdminRouteIds.join(',')}</dd>
      <dd data-testid="first-admin-route-id">{firstAllowedAdminRouteId ?? ''}</dd>
      <dd data-testid="first-admin-path">{firstAllowedAdminPath ?? ''}</dd>
      <dd data-testid="error">{error ?? ''}</dd>
      <dd data-testid="loading">{String(isLoading)}</dd>
    </dl>
  )
}

describe('RouteAccessProvider', () => {
  it('loads navigation only after auth bootstrap and derives admin route state', async () => {
    vi.mocked(fetchRouteAccessNavigation).mockResolvedValue({
      items: [
        { id: 'route:admin-apps' },
        { id: 'route:home' },
        { id: 'route:unknown-future-route' },
      ],
    })

    const { rerender } = renderWithAuth(
      createAuthValue({ isBootstrapping: true }),
      <RouteAccessProvider>
        <RouteAccessProbe />
      </RouteAccessProvider>,
    )

    expect(vi.mocked(fetchRouteAccessNavigation)).not.toHaveBeenCalled()

    rerender(
      <AuthContext.Provider
        value={createAuthValue({
          user: {
            sub: '003000000000001',
            email: 'route@example.com',
            permissions: ['PORTAL_USER'],
          },
        })}
      >
        <RouteAccessProvider>
          <RouteAccessProbe />
        </RouteAccessProvider>
      </AuthContext.Provider>,
    )

    await waitFor(() => {
      expect(vi.mocked(fetchRouteAccessNavigation)).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('allowed-route-ids').textContent).toBe(
      'route:home,route:admin-apps',
    )
    expect(screen.getByTestId('allowed-admin-route-ids').textContent).toBe(
      'route:admin-apps',
    )
    expect(screen.getByTestId('first-admin-route-id').textContent).toBe('route:admin-apps')
    expect(screen.getByTestId('first-admin-path').textContent).toBe('/admin/apps')
    expect(screen.getByTestId('error').textContent).toBe('')
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('resets route state on logout', async () => {
    vi.mocked(fetchRouteAccessNavigation).mockResolvedValue({
      items: [{ id: 'route:admin-query-templates' }],
    })

    const authenticatedValue = createAuthValue({
      user: {
        sub: '003000000000002',
        email: 'admin@example.com',
        permissions: ['PORTAL_ADMIN'],
      },
    })

    const { rerender } = renderWithAuth(
      authenticatedValue,
      <RouteAccessProvider>
        <RouteAccessProbe />
      </RouteAccessProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('allowed-route-ids').textContent).toBe(
        'route:admin-query-templates',
      )
    })

    rerender(
      <AuthContext.Provider value={createAuthValue({ user: null })}>
        <RouteAccessProvider>
          <RouteAccessProbe />
        </RouteAccessProvider>
      </AuthContext.Provider>,
    )

    expect(screen.getByTestId('allowed-route-ids').textContent).toBe('')
    expect(screen.getByTestId('allowed-admin-route-ids').textContent).toBe('')
    expect(screen.getByTestId('first-admin-route-id').textContent).toBe('')
    expect(screen.getByTestId('first-admin-path').textContent).toBe('')
    expect(screen.getByTestId('error').textContent).toBe('')
  })
})
