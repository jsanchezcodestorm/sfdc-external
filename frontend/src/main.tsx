import { GoogleOAuthProvider } from '@react-oauth/google'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppDialogProvider } from './components/AppDialogProvider'
import { GOOGLE_CLIENT_ID } from './config/env'
import { AuthProvider } from './features/auth/AuthContext'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || 'missing-google-client-id'}>
      <AuthProvider>
        <AppDialogProvider>
          <App />
        </AppDialogProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
