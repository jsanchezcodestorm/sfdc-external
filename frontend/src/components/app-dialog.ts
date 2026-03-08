import { createContext, useContext } from 'react'

type DialogTone = 'default' | 'danger'

type SharedDialogOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: DialogTone
  dismissible?: boolean
}

export type ConfirmDialogOptions = SharedDialogOptions
export type AlertDialogOptions = SharedDialogOptions

export type AppDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
  alert: (options: AlertDialogOptions) => Promise<void>
}

export const AppDialogContext = createContext<AppDialogContextValue | null>(null)

export function useAppDialog() {
  const context = useContext(AppDialogContext)

  if (!context) {
    throw new Error('useAppDialog must be used inside AppDialogProvider')
  }

  return context
}
