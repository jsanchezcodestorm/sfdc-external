import { createContext } from 'react'

import type { SetupStatusResponse } from './setup-types'

export type SetupContextValue = {
  status: SetupStatusResponse | null
  brandName: string
  isLoading: boolean
  error: string | null
  refreshStatus: () => Promise<SetupStatusResponse>
}

export const SetupContext = createContext<SetupContextValue | undefined>(undefined)
