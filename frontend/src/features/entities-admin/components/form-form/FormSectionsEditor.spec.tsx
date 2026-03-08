import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FormSectionsEditor } from './FormSectionsEditor'
import type { FormSectionDraft } from './form-form.types'

const SECTIONS: FormSectionDraft[] = [
  {
    title: 'Section A',
    fields: [
      {
        field: 'Name',
        label: 'Primary Name',
        inputType: 'text',
        required: true,
        placeholder: '',
        lookupEnabled: false,
        lookup: {
          searchField: '',
          prefill: false,
          whereJson: '',
          orderByJson: '',
        },
      },
    ],
  },
  {
    title: 'Section B',
    fields: [
      {
        field: 'Phone',
        label: 'Backup Phone',
        inputType: 'tel',
        required: false,
        placeholder: '',
        lookupEnabled: false,
        lookup: {
          searchField: '',
          prefill: false,
          whereJson: '',
          orderByJson: '',
        },
      },
    ],
  },
]

describe('FormSectionsEditor', () => {
  it('focuses one active section at a time', () => {
    render(
      <FormSectionsEditor
        objectApiName="Account"
        sections={SECTIONS}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByDisplayValue('Primary Name')).not.toBeNull()
    expect(screen.queryByDisplayValue('Backup Phone')).toBeNull()

    fireEvent.click(screen.getByText('Section B').closest('button') as HTMLButtonElement)

    expect(screen.getByDisplayValue('Backup Phone')).not.toBeNull()
    expect(screen.queryByDisplayValue('Primary Name')).toBeNull()
  })
})
