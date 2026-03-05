import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'

import { GOOGLE_CLIENT_ID } from '../../../config/env'

import { useAuth } from '../useAuth'

type GoogleSignInButtonProps = {
  className?: string
}

export function GoogleSignInButton({ className }: GoogleSignInButtonProps) {
  const { loginWithGoogleIdToken } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSuccess = async (response: CredentialResponse) => {
    const idToken = response.credential

    if (!idToken) {
      setErrorMessage('Token Google non disponibile. Riprova.')
      return
    }

    setErrorMessage(null)
    setIsLoading(true)

    try {
      await loginWithGoogleIdToken(idToken)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Login Google non riuscito. Riprova.'
      setErrorMessage(message)
    } finally {
      setIsLoading(false)
    }
  }

  if (!GOOGLE_CLIENT_ID) {
    return (
      <p className="text-sm text-amber-700">
        Configura <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> per
        abilitare il login Google.
      </p>
    )
  }

  return (
    <div className={className}>
      <div className="flex justify-center">
        <GoogleLogin
          onSuccess={(response) => {
            void handleSuccess(response)
          }}
          onError={() => {
            setErrorMessage('Accesso Google annullato o non riuscito.')
          }}
          theme="outline"
          text="signin_with"
          shape="pill"
          size="large"
        />
      </div>

      {isLoading ? (
        <p className="mt-3 text-center text-sm text-slate-600">
          Verifica credenziali in corso...
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 text-center text-sm text-rose-700">{errorMessage}</p>
      ) : null}
    </div>
  )
}
