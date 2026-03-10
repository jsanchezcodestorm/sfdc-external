import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { SetupStatusScreen } from './SetupStatusScreen'

import { useSetup } from '../useSetup'

export function RequireCompletedSetup() {
  const { status, isLoading, error } = useSetup()
  const location = useLocation()

  if (isLoading) {
    return (
      <SetupStatusScreen
        eyebrow="Initial Setup"
        title="Verifica configurazione in corso"
        description="Controllo dello stato applicativo prima di caricare routing, sessione e workspace."
      />
    )
  }

  if (error) {
    return (
      <SetupStatusScreen
        eyebrow="Initial Setup"
        title="Impossibile verificare il setup"
        description={error}
        tone="danger"
      />
    )
  }

  if (status?.state !== 'completed') {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace to="/setup" state={{ from }} />
  }

  return <Outlet />
}
