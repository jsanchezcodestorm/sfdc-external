import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import {
  RuntimeNavigationContext,
  type RuntimeNavigationContextValue,
} from './runtime-navigation-context'

function isRuntimeWorkspacePath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/s/')
}

export function RuntimeNavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const isRuntimeRoute = isRuntimeWorkspacePath(location.pathname)
  const routeToken = `${location.pathname}${location.search}${location.hash}`
  const [openRouteToken, setOpenRouteToken] = useState<string | null>(null)
  const isDrawerOpen = isRuntimeRoute && openRouteToken === routeToken

  useEffect(() => {
    if (!isDrawerOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isDrawerOpen])

  const value = useMemo<RuntimeNavigationContextValue>(
    () => ({
      isRuntimeRoute,
      isDrawerOpen,
      openDrawer: () => {
        setOpenRouteToken(routeToken)
      },
      closeDrawer: () => {
        setOpenRouteToken(null)
      },
      toggleDrawer: () => {
        setOpenRouteToken((current) => (current === routeToken ? null : routeToken))
      },
    }),
    [isDrawerOpen, isRuntimeRoute, routeToken],
  )

  return (
    <RuntimeNavigationContext.Provider value={value}>
      {children}
    </RuntimeNavigationContext.Provider>
  )
}
