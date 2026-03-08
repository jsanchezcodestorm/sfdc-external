import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../lib/api'
import {
  fetchEntityConfig,
  fetchEntityList,
} from '../entity-api'

import { EntityListPage } from './EntityListPage'

vi.mock('../entity-api', () => ({
  deleteEntityRecord: vi.fn(),
  fetchEntityConfig: vi.fn(),
  fetchEntityList: vi.fn(),
  isInvalidEntityCursorError: (error: unknown) =>
    error instanceof ApiError &&
    error.status === 400 &&
    error.message.includes('Invalid or expired entity cursor'),
}))

function renderPage(initialEntry = '/s/account?viewId=pipeline') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/s/:entityId" element={<EntityListPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EntityListPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fetchEntityConfig).mockResolvedValue({
      entity: {
        id: 'account',
        label: 'Accounts',
        list: {
          title: 'Accounts',
          views: [
            {
              id: 'pipeline',
              label: 'Pipeline',
              pageSize: 20,
              query: { object: 'Account' },
              columns: ['Name'],
              search: { fields: ['Name'] },
            },
            {
              id: 'all',
              label: 'All',
              pageSize: 20,
              query: { object: 'Account' },
              columns: ['Name'],
            },
          ],
        },
      },
    } as never)
  })

  it('navigates forward and backward using cursor requests', async () => {
    const calls: Array<Record<string, unknown>> = []

    vi.mocked(fetchEntityList).mockImplementation(async (_entityId, options = {}) => {
      calls.push(options as Record<string, unknown>)

      if (options.cursor === 'cursor-2') {
        return {
          title: 'Accounts',
          columns: ['Name'],
          records: [{ Id: '002', Name: 'Beta' }],
          pageSize: 20,
          total: 2,
          viewId: 'pipeline',
          nextCursor: null,
        } as never
      }

      return {
        title: 'Accounts',
        columns: ['Name'],
        records: [{ Id: '001', Name: 'Acme' }],
        pageSize: 20,
        total: 2,
        viewId: 'pipeline',
        nextCursor: 'cursor-2',
      } as never
    })

    renderPage()

    await screen.findByText('Acme')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Beta')

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(screen.getByText('Acme')).toBeTruthy())

    expect(calls.map((entry) => entry.cursor ?? null)).toEqual([null, 'cursor-2', null])
  })

  it('resets cursor when search is submitted', async () => {
    const calls: Array<Record<string, unknown>> = []

    vi.mocked(fetchEntityList).mockImplementation(async (_entityId, options = {}) => {
      calls.push(options as Record<string, unknown>)

      return {
        title: 'Accounts',
        columns: ['Name'],
        records: [{ Id: '001', Name: String(options.search ?? 'Acme') }],
        pageSize: 20,
        total: 1,
        viewId: 'pipeline',
        nextCursor: options.cursor ? 'cursor-2' : null,
      } as never
    })

    renderPage('/s/account?viewId=pipeline&cursor=cursor-2&search=Acme')

    await screen.findByDisplayValue('Acme')
    fireEvent.change(screen.getByPlaceholderText('Search records'), {
      target: { value: 'Beta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() =>
      expect(calls.at(-1)).toMatchObject({
        viewId: 'pipeline',
        search: 'Beta',
      }),
    )
    expect(calls.at(-1)?.cursor).toBeUndefined()
  })

  it('drops an invalid cursor and reloads the first page once', async () => {
    vi.mocked(fetchEntityList)
      .mockRejectedValueOnce(new ApiError(400, 'Invalid or expired entity cursor'))
      .mockResolvedValueOnce({
        title: 'Accounts',
        columns: ['Name'],
        records: [{ Id: '001', Name: 'Recovered' }],
        pageSize: 20,
        total: 1,
        viewId: 'pipeline',
        nextCursor: null,
      } as never)

    renderPage('/s/account?viewId=pipeline&cursor=stale')

    await screen.findByText('Recovered')
    expect(vi.mocked(fetchEntityList).mock.calls.map((call) => call[1]?.cursor ?? null)).toEqual([
      'stale',
      null,
    ])
  })
})
