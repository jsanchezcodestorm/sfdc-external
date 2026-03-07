import { Outlet } from 'react-router-dom'

import { AdminNavigationProvider } from './AdminNavigationContext'
import { AppTopBar } from './AppTopBar'

export function AppShell() {
  return (
    <AdminNavigationProvider>
      <AppTopBar />
      <Outlet />
    </AdminNavigationProvider>
  )
}
