import { googleLogout } from '@react-oauth/google'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { apiFetch, ApiError, clearCsrfToken, setCsrfToken } from '../../lib/api'
import { useSetup } from '../setup/useSetup'

import { AuthContext, type AuthContextValue } from './auth-context'
import type { AuthSessionResponse, SessionUser } from './auth-types'

type AuthProviderProps = {
  children: ReactNode
}

function isMissingSessionError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  )
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { isLoading: isSetupLoading, status: setupStatus } = useSetup()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  const restoreSession = useCallback(async () => {
    const payload = await apiFetch<AuthSessionResponse>('/auth/session')
    setCsrfToken(payload.csrfToken)
    setUser(payload.user)
  }, [])

  const loginWithGoogleIdToken = useCallback(async (idToken: string) => {
    const payload = await apiFetch<AuthSessionResponse>('/auth/google', {
      method: 'POST',
      body: {
        idToken,
      },
    })

    setCsrfToken(payload.csrfToken)
    setUser(payload.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
      })
    } catch (error) {
      if (!isMissingSessionError(error)) {
        throw error
      }
    }

    try {
      googleLogout()
    } catch {
      // Ignore Google logout errors because local session is already cleared.
    }

    clearCsrfToken()
    setUser(null)
  }, [])

  useEffect(() => {
    let isCancelled = false

    if (isSetupLoading) {
      return () => {
        isCancelled = true
      }
    }

    if (setupStatus?.state !== 'completed') {
      clearCsrfToken()
      setUser(null)
      setIsBootstrapping(false)

      return () => {
        isCancelled = true
      }
    }

    setIsBootstrapping(true)

    const bootstrap = async () => {
      try {
        await restoreSession()
      } catch (error) {
        if (!isCancelled && isMissingSessionError(error)) {
          clearCsrfToken()
          setUser(null)
          return
        }

        if (!isCancelled) {
          const message =
            error instanceof Error
              ? error.message
              : 'Errore durante il ripristino sessione.'
          console.warn(message)
        }
      } finally {
        if (!isCancelled) {
          setIsBootstrapping(false)
        }
      }
    }

    void bootstrap()

    return () => {
      isCancelled = true
    }
  }, [isSetupLoading, restoreSession, setupStatus?.state])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isBootstrapping,
      loginWithGoogleIdToken,
      logout,
    }),
    [user, isBootstrapping, loginWithGoogleIdToken, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
