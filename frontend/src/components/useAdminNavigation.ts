import { useContext } from 'react'

import { AdminNavigationContext } from './admin-navigation-context'

export function useAdminNavigation() {
  const context = useContext(AdminNavigationContext)

  if (context === null) {
    throw new Error('useAdminNavigation must be used within AdminNavigationProvider')
  }

  return context
}
