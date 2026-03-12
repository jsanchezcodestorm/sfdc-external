import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SetupContext, type SetupContextValue } from '../setup-context'

import { RequireCompletedSetup } from './RequireCompletedSetup'

function createSetupValue(
  overrides: Partial<SetupContextValue>,
): SetupContextValue {
  return {
    status: {
      state: 'pending',
      authConfigMode: 'database',
    },
    brandName: 'SFDC External',
    isLoading: false,
    error: null,
    async refreshStatus() {
      return {
        state: 'pending',
        authConfigMode: 'database',
      }
    },
    ...overrides,
  }
}

describe('RequireCompletedSetup', () => {
  it('redirects every protected route to /setup while setup is pending', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <SetupContext.Provider value={createSetupValue({})}>
          <Routes>
            <Route path="/setup" element={<div>Setup Screen</div>} />
            <Route element={<RequireCompletedSetup />}>
              <Route path="/login" element={<div>Login Screen</div>} />
            </Route>
          </Routes>
        </SetupContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Setup Screen')).not.toBeNull()
  })

  it('allows protected routes after setup completion', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <SetupContext.Provider
          value={createSetupValue({
            status: {
              state: 'completed',
              siteName: 'Acme Portal',
              authConfigMode: 'database',
            },
            brandName: 'Acme Portal',
          })}
        >
          <Routes>
            <Route path="/setup" element={<div>Setup Screen</div>} />
            <Route element={<RequireCompletedSetup />}>
              <Route path="/login" element={<div>Login Screen</div>} />
            </Route>
          </Routes>
        </SetupContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Login Screen')).not.toBeNull()
  })
})
