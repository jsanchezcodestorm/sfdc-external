import { createContext } from 'react'

export type AdminNavigationContextValue = {
  isAdminRoute: boolean
  isSidebarOpen: boolean
  openSidebar: () => void
  closeSidebar: () => void
  toggleSidebar: () => void
}

export const AdminNavigationContext = createContext<AdminNavigationContextValue | null>(null)
