import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'

import { RouteAccessDeniedPage } from './RouteAccessDeniedPage'
import { RouteAccessLoadingState } from './RouteAccessLoadingState'

import { useRouteAccess } from '../useRouteAccess'

export function AdminIndexRedirect() {
  const { user, isBootstrapping } = useAuth()
  const { firstAllowedAdminPath, isLoading } = useRouteAccess()
  const location = useLocation()

  if (isBootstrapping || (Boolean(user) && isLoading)) {
    return <RouteAccessLoadingState />
  }

  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace to="/login" state={{ from }} />
  }

  if (firstAllowedAdminPath) {
    return <Navigate replace to={firstAllowedAdminPath} />
  }

  return (
    <RouteAccessDeniedPage
      title="Nessuna sezione admin disponibile"
      description="La sessione e valida, ma non risultano sezioni admin consentite."
    />
  )
}
