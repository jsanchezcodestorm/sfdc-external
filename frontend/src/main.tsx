import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppDialogProvider } from './components/AppDialogProvider'
import { AuthProvider } from './features/auth/AuthContext'
import { SetupProvider } from './features/setup/SetupContext'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SetupProvider>
      <AuthProvider>
        <AppDialogProvider>
          <App />
        </AppDialogProvider>
      </AuthProvider>
    </SetupProvider>
  </StrictMode>,
)
