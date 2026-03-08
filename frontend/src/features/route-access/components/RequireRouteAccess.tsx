import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'

import { RouteAccessLoadingState } from './RouteAccessLoadingState'
import { RouteAccessDeniedPage } from './RouteAccessDeniedPage'

import { useRouteAccess } from '../useRouteAccess'
import type { KnownRouteId } from '../route-access-types'

type RequireRouteAccessProps = {
  routeId: KnownRouteId
  allowAnonymous?: boolean
}

export function RequireRouteAccess({
  routeId,
  allowAnonymous = false,
}: RequireRouteAccessProps) {
  const { user, isBootstrapping } = useAuth()
  const { hasRoute, isLoading } = useRouteAccess()
  const location = useLocation()

  if (isBootstrapping || (Boolean(user) && isLoading)) {
    return <RouteAccessLoadingState />
  }

  if (!user) {
    if (allowAnonymous) {
      return <Outlet />
    }

    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace to="/login" state={{ from }} />
  }

  if (hasRoute(routeId)) {
    return <Outlet />
  }

  return <RouteAccessDeniedPage requestedRouteId={routeId} />
}
