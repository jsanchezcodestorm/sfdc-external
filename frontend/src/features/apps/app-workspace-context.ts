import { createContext } from 'react'

import type { AvailableApp, AvailableAppEntity } from './app-types'

export type AppWorkspaceContextValue = {
  apps: AvailableApp[]
  selectedApp: AvailableApp | null
  selectedAppId: string | null
  selectedEntities: AvailableAppEntity[]
  loading: boolean
  error: string | null
  selectApp: (appId: string) => void
}

export const AppWorkspaceContext = createContext<AppWorkspaceContextValue | null>(null)
