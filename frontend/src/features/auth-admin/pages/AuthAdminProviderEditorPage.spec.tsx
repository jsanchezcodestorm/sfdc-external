import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  fetchAuthAdminProvider,
  fetchAuthAdminProviders,
  updateAuthAdminProvider,
} from '../auth-admin-api'
import { AuthAdminProviderEditorPage } from './AuthAdminProviderEditorPage'

vi.mock('../auth-admin-api', () => ({
  fetchAuthAdminProviders: vi.fn(),
  fetchAuthAdminProvider: vi.fn(),
  updateAuthAdminProvider: vi.fn(),
}))

describe('AuthAdminProviderEditorPage', () => {
  it('submits the dedicated create route and shows quick setup instructions', async () => {
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
      ],
    })
    vi.mocked(fetchAuthAdminProvider).mockResolvedValue({
      provider: {
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
        callbackUri: 'http://localhost:5173/api/auth/oidc/google/callback',
      },
    })
    vi.mocked(updateAuthAdminProvider).mockResolvedValue({
      provider: {
        id: 'google',
        providerFamily: 'google',
        type: 'oidc',
        label: 'Google Workspace',
        enabled: true,
        sortOrder: 5,
        isConfigured: true,
        isRuntimeAvailable: true,
        hasClientSecret: true,
        status: 'active',
        issuer: 'https://accounts.google.com',
        loginPath: '/api/auth/oidc/google/start',
      },
    })

    render(
      <MemoryRouter initialEntries={['/admin/auth/providers/__new__']}>
        <Routes>
          <Route
            path="/admin/auth/providers/__new__"
            element={<AuthAdminProviderEditorPage mode="create" />}
          />
          <Route
            path="/admin/auth/providers/:providerId/edit"
            element={<AuthAdminProviderEditorPage mode="edit" />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Client ID')).not.toBeNull()
    })

    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Google Workspace' },
    })
    fireEvent.change(screen.getByLabelText('Ordine'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Client ID'), {
      target: { value: 'google-client-id' },
    })
    fireEvent.change(screen.getByLabelText('Client Secret'), {
      target: { value: 'google-client-secret' },
    })

    expect(screen.getByDisplayValue('http://localhost:5173/api/auth/oidc/google/callback')).not.toBeNull()
    expect(screen.getByText('Google Cloud Console')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Configura provider' }))

    await waitFor(() => {
      expect(updateAuthAdminProvider).toHaveBeenCalledWith('google', {
        label: 'Google Workspace',
        enabled: true,
        sortOrder: 5,
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
      })
    })
  })
})
