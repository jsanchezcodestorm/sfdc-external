import { useContext } from 'react'

import { AppWorkspaceContext } from './app-workspace-context'

export function useAppWorkspace() {
  const context = useContext(AppWorkspaceContext)

  if (!context) {
    throw new Error('useAppWorkspace must be used inside AppWorkspaceProvider')
  }

  return context
}
