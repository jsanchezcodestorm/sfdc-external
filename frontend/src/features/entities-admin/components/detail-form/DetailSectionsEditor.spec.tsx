import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DetailSectionsEditor } from './DetailSectionsEditor'
import type { DetailSectionDraft } from './detail-form.types'

function StatefulDetailSectionsEditor({
  initialSections,
}: {
  initialSections: DetailSectionDraft[]
}) {
  const [sections, setSections] = React.useState(initialSections)

  return (
    <DetailSectionsEditor
      objectApiName="Account"
      sections={sections}
      onChange={setSections}
    />
  )
}

describe('DetailSectionsEditor', () => {
  it('creates a new section with an empty field instead of auto-prefilling from previous sections', () => {
    render(
      <StatefulDetailSectionsEditor
        initialSections={[
          {
            clientId: 'existing-section-1',
            title: 'Overview',
            fields: [
              {
                clientId: 'existing-field-1',
                label: '',
                field: 'Name',
                template: '',
                sourceMode: 'field',
                highlight: false,
                format: '',
              },
            ],
          },
        ]}
      />,
    )

    fireEvent.click(screen.getAllByText('Aggiungi')[0] as HTMLButtonElement)

    const fieldInputs = screen.getAllByPlaceholderText('Cerca o inserisci un campo Salesforce')
    expect((fieldInputs[fieldInputs.length - 1] as HTMLInputElement).value).toBe('')
  })

  it('lets the user clear a field value without restoring the previous preferred field', () => {
    render(
      <StatefulDetailSectionsEditor
        initialSections={[
          {
            clientId: 'existing-section-1',
            title: 'Overview',
            fields: [
              {
                clientId: 'existing-field-1',
                label: '',
                field: 'Name',
                template: '',
                sourceMode: 'field',
                highlight: false,
                format: '',
              },
            ],
          },
        ]}
      />,
    )

    fireEvent.click(screen.getAllByText('Espandi')[0] as HTMLButtonElement)

    const fieldInput = screen.getByDisplayValue('Name') as HTMLInputElement
    fireEvent.change(fieldInput, { target: { value: '' } })

    expect(fieldInput.value).toBe('')
  })
})
