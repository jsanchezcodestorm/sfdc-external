import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { fetchSetupStatus } from './setup-api'
import { SetupContext, type SetupContextValue } from './setup-context'
import type { SetupStatusResponse } from './setup-types'

const DEFAULT_BRAND_NAME = 'SFDC External'

type SetupProviderProps = {
  children: ReactNode
}

export function SetupProvider({ children }: SetupProviderProps) {
  const [status, setStatus] = useState<SetupStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    const payload = await fetchSetupStatus()
    setStatus(payload)
    setError(null)
    return payload
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadStatus = async () => {
      try {
        const payload = await fetchSetupStatus()

        if (cancelled) {
          return
        }

        setStatus(payload)
        setError(null)
      } catch (loadError) {
        if (cancelled) {
          return
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Errore durante la verifica dello stato setup.'

        setStatus(null)
        setError(message)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadStatus()

    return () => {
      cancelled = true
    }
  }, [])

  const brandName = status?.siteName?.trim() || DEFAULT_BRAND_NAME

  const value = useMemo<SetupContextValue>(
    () => ({
      status,
      brandName,
      isLoading,
      error,
      refreshStatus,
    }),
    [brandName, error, isLoading, refreshStatus, status],
  )

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>
}
