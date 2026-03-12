import { createContext } from 'react'

import type { AvailableApp, AvailableAppEntityItem, AvailableAppHomeItem, AvailableAppItem } from './app-types'

export type AppWorkspaceContextValue = {
  apps: AvailableApp[]
  selectedApp: AvailableApp | null
  selectedAppId: string | null
  selectedItems: AvailableAppItem[]
  selectedEntities: AvailableAppEntityItem[]
  homeItem: AvailableAppHomeItem | null
  loading: boolean
  error: string | null
  selectApp: (appId: string) => void
}

export const AppWorkspaceContext = createContext<AppWorkspaceContextValue | null>(null)
