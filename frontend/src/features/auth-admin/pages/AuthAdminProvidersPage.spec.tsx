import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { fetchAuthAdminProviders } from '../auth-admin-api'
import { AuthAdminProvidersPage } from './AuthAdminProvidersPage'

vi.mock('../auth-admin-api', () => ({
  fetchAuthAdminProviders: vi.fn(),
}))

describe('AuthAdminProvidersPage', () => {
  it('renders dedicated links for create and edit routes', async () => {
    vi.mocked(fetchAuthAdminProviders).mockResolvedValue({
      items: [
        {
          id: 'google',
          providerFamily: 'google',
          type: 'oidc',
          label: 'Google',
          enabled: true,
          sortOrder: 0,
          isConfigured: false,
          isRuntimeAvailable: false,
          hasClientSecret: false,
          status: 'not_configured',
        },
        {
          id: 'local',
          providerFamily: 'local',
          type: 'local',
          label: 'Username e password',
          enabled: true,
          sortOrder: 100,
          isConfigured: true,
          isRuntimeAvailable: true,
          hasClientSecret: false,
          status: 'active',
        },
      ],
    })

    render(
      <MemoryRouter>
        <AuthAdminProvidersPage />
      </MemoryRouter>,
    )

    const createLink = await screen.findByRole('link', { name: 'Configura provider' })
    const configureLink = screen.getByRole('link', { name: 'Configura' })
    const editLink = screen.getByRole('link', { name: 'Modifica' })

    expect(createLink.getAttribute('href')).toBe('/admin/auth/providers/__new__')
    expect(configureLink.getAttribute('href')).toBe('/admin/auth/providers/google/edit')
    expect(editLink.getAttribute('href')).toBe('/admin/auth/providers/local/edit')
  })
})
