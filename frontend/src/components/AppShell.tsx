import { Outlet } from 'react-router-dom'

import { AppTopBar } from './AppTopBar'

export function AppShell() {
  return (
    <>
      <AppTopBar />
      <Outlet />
    </>
  )
}
