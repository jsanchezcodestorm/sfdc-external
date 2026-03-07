import { useContext } from 'react'

import { RuntimeNavigationContext } from './runtime-navigation-context'

export function useRuntimeNavigation() {
  const context = useContext(RuntimeNavigationContext)

  if (context === null) {
    throw new Error('useRuntimeNavigation must be used within RuntimeNavigationProvider')
  }

  return context
}
