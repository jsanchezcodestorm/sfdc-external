import { createContext } from 'react'

export type RuntimeNavigationContextValue = {
  isRuntimeRoute: boolean
  isDrawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
}

export const RuntimeNavigationContext = createContext<RuntimeNavigationContextValue | null>(null)
