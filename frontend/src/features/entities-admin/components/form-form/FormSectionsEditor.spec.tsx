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
        placeholder: '',
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
        placeholder: '',
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

    expect(screen.getByDisplayValue('Name')).not.toBeNull()
    expect(screen.queryByDisplayValue('Phone')).toBeNull()

    fireEvent.click(screen.getByText('Section B').closest('button') as HTMLButtonElement)

    expect(screen.getByDisplayValue('Phone')).not.toBeNull()
    expect(screen.queryByDisplayValue('Name')).toBeNull()
  })
})
