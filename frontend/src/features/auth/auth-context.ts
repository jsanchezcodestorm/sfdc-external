import { createContext } from 'react'

import type { SessionUser } from './auth-types'

export type AuthContextValue = {
  user: SessionUser | null
  isBootstrapping: boolean
  loginWithPassword: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
