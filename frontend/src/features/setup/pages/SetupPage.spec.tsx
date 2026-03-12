import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { SetupContext, type SetupContextValue } from '../setup-context'
import type { SetupStatusResponse } from '../setup-types'

import { completeInitialSetup, testSalesforceSetup } from '../setup-api'
import { SetupPage } from './SetupPage'

vi.mock('../setup-api', () => ({
  completeInitialSetup: vi.fn(),
  testSalesforceSetup: vi.fn(),
}))

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
        state: 'completed',
        siteName: 'Acme Portal',
        authConfigMode: 'database',
      }
    },
    ...overrides,
  }
}

describe('SetupPage', () => {
  it('completes the happy path setup flow and redirects to login', async () => {
    vi.mocked(testSalesforceSetup).mockResolvedValue({
      success: true,
      organizationId: '00D000000000001',
      instanceUrl: 'https://example.my.salesforce.com',
      username: 'integration@example.com',
    })
    vi.mocked(completeInitialSetup).mockResolvedValue({
      state: 'completed',
      siteName: 'Acme Portal',
      authConfigMode: 'database',
    })
    const refreshStatus = vi.fn(async (): Promise<SetupStatusResponse> => ({
      state: 'completed',
      siteName: 'Acme Portal',
      authConfigMode: 'database',
    }))

    render(
      <MemoryRouter initialEntries={['/setup']}>
        <SetupContext.Provider
          value={createSetupValue({
            refreshStatus,
          })}
        >
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </SetupContext.Provider>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Acme Operations Portal'), {
      target: { value: 'Acme Portal' },
    })
    fireEvent.change(screen.getByPlaceholderText('admin@example.com'), {
      target: { value: 'admin@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Inserisci la password iniziale'), {
      target: { value: 'Bootstrap!123' },
    })
    fireEvent.change(screen.getByPlaceholderText('Ripeti la password iniziale'), {
      target: { value: 'Bootstrap!123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))

    fireEvent.change(screen.getByDisplayValue('https://login.salesforce.com'), {
      target: { value: 'https://login.salesforce.com' },
    })
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'integration@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'super-secret-password' },
    })
    fireEvent.change(screen.getByLabelText('Security Token'), {
      target: { value: 'security-token' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Testa connessione' }))

    await waitFor(() => {
      expect(screen.getByText('Review finale')).not.toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Completa setup' }))

    await waitFor(() => {
      expect(screen.getByText('Login Screen')).not.toBeNull()
    })

    expect(vi.mocked(testSalesforceSetup)).toHaveBeenCalledWith({
      mode: 'username-password',
      loginUrl: 'https://login.salesforce.com',
      username: 'integration@example.com',
      password: 'super-secret-password',
      securityToken: 'security-token',
    })
    expect(vi.mocked(completeInitialSetup)).toHaveBeenCalledWith({
      siteName: 'Acme Portal',
      adminEmail: 'admin@example.com',
      bootstrapPassword: 'Bootstrap!123',
      salesforce: {
        mode: 'username-password',
        loginUrl: 'https://login.salesforce.com',
        username: 'integration@example.com',
        password: 'super-secret-password',
        securityToken: 'security-token',
      },
    })
    expect(refreshStatus).toHaveBeenCalledTimes(1)
  })
})
