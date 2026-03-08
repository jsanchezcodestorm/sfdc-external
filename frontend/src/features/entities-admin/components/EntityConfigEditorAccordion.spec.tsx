import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  EntityConfigEditorAccordion,
  type EntityConfigEditorAccordionItem,
} from './EntityConfigEditorAccordion'

const ITEMS: EntityConfigEditorAccordionItem[] = [
  {
    id: 'header-query',
    label: 'Header & Query',
    title: 'Area A',
    description: 'Prima area',
    content: <div>Contenuto A</div>,
  },
  {
    id: 'sections',
    label: 'Sections',
    title: 'Area B',
    description: 'Seconda area',
    content: <div>Contenuto B</div>,
  },
]

function AccordionHarness() {
  const [activeItemId, setActiveItemId] = useState('header-query')

  return (
    <EntityConfigEditorAccordion
      items={ITEMS}
      activeItemId={activeItemId}
      navigationLabel="Test navigation"
      onItemSelect={setActiveItemId}
    />
  )
}

describe('EntityConfigEditorAccordion', () => {
  it('renders only the active panel and switches through tabs', () => {
    render(<AccordionHarness />)

    expect(screen.getByRole('tabpanel')).not.toBeNull()
    expect(screen.getByText('Contenuto A')).not.toBeNull()
    expect(screen.queryByText('Contenuto B')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Vai alla tab Area B' }))

    expect(screen.getByText('Contenuto B')).not.toBeNull()
    expect(screen.queryByText('Contenuto A')).toBeNull()
  })
})
