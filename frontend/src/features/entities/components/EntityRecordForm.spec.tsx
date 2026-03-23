import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { searchEntityFormLookup } from '../entity-api'
import { EntityRecordForm } from './EntityRecordForm'

vi.mock('../entity-api', () => ({
  searchEntityFormLookup: vi.fn(),
}))

describe('EntityRecordForm', () => {
  it('renders describe-driven controls and submits selected lookup ids', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    vi.mocked(searchEntityFormLookup).mockResolvedValue({
      items: [
        {
          id: '001000000000999',
          label: 'Parent Acme',
          objectApiName: 'Account',
          subtitle: '001000000000999',
        },
      ],
    })

    render(
      <EntityRecordForm
        entityId="account"
        sections={[
          {
            title: 'Main',
            fields: [
              {
                field: 'Name',
                label: 'Account Name',
                inputType: 'text',
                required: true,
              },
              {
                field: 'Industry',
                label: 'Industry',
                inputType: 'select',
                required: false,
                options: [
                  { value: 'Technology', label: 'Technology' },
                  { value: 'Finance', label: 'Finance' },
                ],
              },
              {
                field: 'IsActive__c',
                label: 'Active',
                inputType: 'checkbox',
                required: false,
              },
              {
                field: 'ParentId',
                label: 'Parent Account',
                inputType: 'lookup',
                required: false,
                lookup: {
                  referenceTo: ['Account'],
                  searchField: 'Name',
                },
              },
            ],
          },
        ]}
        initialValues={{}}
        lookupContext={{ parentRel: 'Account' }}
        submitLabel="Create record"
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Account Name *'), {
      target: { value: 'Acme' },
    })
    fireEvent.change(screen.getByLabelText('Industry'), {
      target: { value: 'Technology' },
    })
    fireEvent.click(screen.getByLabelText('Active'))
    fireEvent.change(screen.getByLabelText('Parent Account'), {
      target: { value: 'Pa' },
    })

    await waitFor(() =>
      expect(searchEntityFormLookup).toHaveBeenCalledWith(
        'account',
        'ParentId',
        expect.objectContaining({
          q: 'Pa',
        }),
      ),
    )

    fireEvent.click(await screen.findByText('Parent Acme'))
    fireEvent.click(screen.getByRole('button', { name: 'Create record' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        Name: 'Acme',
        Industry: 'Technology',
        IsActive__c: true,
        ParentId: '001000000000999',
      }),
    )
  })

  it('renders datetime fields with a dedicated datetime-local input and preserves submitted value', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const initialValue = '2026-03-20T09:45:00.000Z'

    render(
      <EntityRecordForm
        entityId="opportunity"
        sections={[
          {
            title: 'Main',
            fields: [
              {
                field: 'CloseAt__c',
                label: 'Close At',
                inputType: 'datetime-local',
                required: true,
              },
            ],
          },
        ]}
        initialValues={{ CloseAt__c: initialValue }}
        lookupContext={{}}
        submitLabel="Create record"
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText('Close At *') as HTMLInputElement
    expect(input.type).toBe('datetime-local')
    expect(input.value).toBe(toExpectedDateTimeLocalValue(initialValue))

    fireEvent.change(input, {
      target: { value: '2026-03-21T14:30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create record' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        CloseAt__c: '2026-03-21T14:30',
      }),
    )
  })

  it('renders time, url and password fields with dedicated input types', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <EntityRecordForm
        entityId="account"
        sections={[
          {
            title: 'Main',
            fields: [
              {
                field: 'BestCallTime__c',
                label: 'Best Call Time',
                inputType: 'time',
                required: false,
              },
              {
                field: 'Website',
                label: 'Website',
                inputType: 'url',
                required: false,
              },
              {
                field: 'SecretCode__c',
                label: 'Secret Code',
                inputType: 'password',
                required: false,
              },
            ],
          },
        ]}
        initialValues={{
          BestCallTime__c: '14:30:00.000Z',
          Website: 'https://example.com',
          SecretCode__c: 'top-secret',
        }}
        lookupContext={{}}
        submitLabel="Create record"
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    )

    const timeInput = screen.getByLabelText('Best Call Time') as HTMLInputElement
    const urlInput = screen.getByLabelText('Website') as HTMLInputElement
    const passwordInput = screen.getByLabelText('Secret Code') as HTMLInputElement

    expect(timeInput.type).toBe('time')
    expect(urlInput.type).toBe('url')
    expect(passwordInput.type).toBe('password')
    expect(timeInput.value).toBe('14:30')
    expect(urlInput.value).toBe('https://example.com')
    expect(passwordInput.value).toBe('top-secret')

    fireEvent.change(timeInput, { target: { value: '16:45' } })
    fireEvent.change(urlInput, { target: { value: 'https://codestorm.it' } })
    fireEvent.change(passwordInput, { target: { value: 'changed-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create record' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        BestCallTime__c: '16:45',
        Website: 'https://codestorm.it',
        SecretCode__c: 'changed-secret',
      }),
    )
  })
})

function toExpectedDateTimeLocalValue(value: string): string {
  const date = new Date(value)
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}
