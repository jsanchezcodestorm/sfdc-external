import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppWorkspaceContext } from '../../apps/app-workspace-context'
import { ApiError } from '../../../lib/api'
import {
  fetchEntityConfig,
  fetchEntityRelatedList,
} from '../entity-api'

import { EntityRelatedListPage } from './EntityRelatedListPage'

vi.mock('../entity-api', () => ({
  deleteEntityRecord: vi.fn(),
  fetchEntityConfig: vi.fn(),
  fetchEntityRelatedList: vi.fn(),
  isInvalidEntityCursorError: (error: unknown) =>
    error instanceof ApiError &&
    error.status === 400 &&
    error.message.includes('Invalid or expired entity cursor'),
}))

function renderPage(
  initialEntry = '/s/account/001000000000001/related/contacts',
) {
  return render(
    <AppWorkspaceContext.Provider
      value={{
        apps: [],
        selectedApp: null,
        selectedAppId: null,
        selectedEntities: [],
        loading: false,
        error: null,
        selectApp() {},
      }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/s/:entityId/:recordId/related/:relatedListId"
            element={<EntityRelatedListPage />}
          />
        </Routes>
      </MemoryRouter>
    </AppWorkspaceContext.Provider>,
  )
}

describe('EntityRelatedListPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fetchEntityConfig).mockResolvedValue({
      entity: {
        id: 'account',
        label: 'Accounts',
        detail: {
          relatedLists: [
            {
              id: 'contacts',
              label: 'Contacts',
              query: { object: 'Contact' },
              columns: ['Name'],
            },
          ],
        },
      },
    } as never)
  })

  it('navigates forward and backward using cursor requests', async () => {
    const calls: Array<Record<string, unknown>> = []

    vi.mocked(fetchEntityRelatedList).mockImplementation(
      async (_entityId, _recordId, _relatedListId, options = {}) => {
        calls.push(options as Record<string, unknown>)

        if (options.cursor === 'cursor-2') {
          return {
            title: 'Contacts',
            columns: ['Name'],
            records: [{ Id: '003000000000002', Name: 'John' }],
            total: 2,
            pageSize: 20,
            nextCursor: null,
          } as never
        }

        return {
          title: 'Contacts',
          columns: ['Name'],
          records: [{ Id: '003000000000001', Name: 'Jane' }],
          total: 2,
          pageSize: 20,
          nextCursor: 'cursor-2',
        } as never
      },
    )

    renderPage()

    await screen.findByText('Jane')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('John')

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(screen.getByText('Jane')).toBeTruthy())

    expect(calls.map((entry) => entry.cursor ?? null)).toEqual([null, 'cursor-2', null])
  })

  it('drops an invalid cursor and reloads the first page once', async () => {
    vi.mocked(fetchEntityRelatedList)
      .mockRejectedValueOnce(new ApiError(400, 'Invalid or expired entity cursor'))
      .mockResolvedValueOnce({
        title: 'Contacts',
        columns: ['Name'],
        records: [{ Id: '003000000000001', Name: 'Recovered' }],
        total: 1,
        pageSize: 20,
        nextCursor: null,
      } as never)

    renderPage('/s/account/001000000000001/related/contacts?cursor=stale')

    await screen.findByText('Recovered')
    expect(
      vi.mocked(fetchEntityRelatedList).mock.calls.map((call) => call[3]?.cursor ?? null),
    ).toEqual(['stale', null])
  })
})
