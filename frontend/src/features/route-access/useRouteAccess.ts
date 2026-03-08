import { useContext } from 'react'

import { RouteAccessContext, type RouteAccessContextValue } from './route-access-context'

export function useRouteAccess(): RouteAccessContextValue {
  const context = useContext(RouteAccessContext)

  if (!context) {
    throw new Error('useRouteAccess must be used inside RouteAccessProvider')
  }

  return context
}
