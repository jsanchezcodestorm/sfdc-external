import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { AdminNavigationContext, type AdminNavigationContextValue } from './admin-navigation-context'

export function AdminNavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const routeToken = `${location.pathname}${location.search}${location.hash}`
  const [openRouteToken, setOpenRouteToken] = useState<string | null>(null)
  const isSidebarOpen = isAdminRoute && openRouteToken === routeToken

  useEffect(() => {
    if (!isSidebarOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isSidebarOpen])

  const value = useMemo<AdminNavigationContextValue>(
    () => ({
      isAdminRoute,
      isSidebarOpen,
      openSidebar: () => {
        setOpenRouteToken(routeToken)
      },
      closeSidebar: () => {
        setOpenRouteToken(null)
      },
      toggleSidebar: () => {
        setOpenRouteToken((current) => (current === routeToken ? null : routeToken))
      },
    }),
    [isAdminRoute, isSidebarOpen, routeToken],
  )

  return (
    <AdminNavigationContext.Provider value={value}>
      {children}
    </AdminNavigationContext.Provider>
  )
}
