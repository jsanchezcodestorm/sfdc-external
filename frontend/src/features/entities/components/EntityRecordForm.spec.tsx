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
})
