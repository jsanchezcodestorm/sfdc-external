import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../features/auth/auth-context'
import { SetupContext, type SetupContextValue } from '../features/setup/setup-context'

import { LoginPage } from './LoginPage'

vi.mock('../features/auth/auth-api', () => ({
  fetchAuthProviders: vi.fn(async () => ({
    items: [{ id: 'local', type: 'local', label: 'Username e password' }],
  })),
}))

function createAuthValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    isBootstrapping: false,
    async loginWithPassword() {},
    async logout() {},
    ...overrides,
  }
}

function createSetupValue(overrides: Partial<SetupContextValue>): SetupContextValue {
  return {
    status: {
      state: 'completed',
      siteName: 'Acme Portal',
      authConfigMode: 'database',
    },
    brandName: 'Acme Portal',
    isLoading: false,
    error: null,
    async refreshStatus() {
      return {
        state: 'completed',
        siteName: 'Acme Portal',
        authConfigMode: 'database',
      }
    },
    ...overrides,
  }
}

describe('LoginPage', () => {
  it('prefills the username and prioritizes local login when OIDC is unavailable', async () => {
    render(
      <MemoryRouter initialEntries={['/login?username=admin@example.com']}>
        <SetupContext.Provider value={createSetupValue({})}>
          <AuthContext.Provider value={createAuthValue({})}>
            <LoginPage />
          </AuthContext.Provider>
        </SetupContext.Provider>
      </MemoryRouter>,
    )

    expect(await screen.findByText("Primo accesso: usa l'email admin configurata durante il setup.")).not.toBeNull()
    expect(screen.getByDisplayValue('admin@example.com')).not.toBeNull()
    expect(screen.queryByText('Nessun provider OIDC disponibile in questo ambiente.')).toBeNull()
  })
})
