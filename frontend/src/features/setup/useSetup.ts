import { useContext } from 'react'

import { SetupContext, type SetupContextValue } from './setup-context'

export function useSetup(): SetupContextValue {
  const context = useContext(SetupContext)

  if (!context) {
    throw new Error('useSetup must be used inside SetupProvider')
  }

  return context
}
