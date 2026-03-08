import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import {
  AppDialogContext,
  type AlertDialogOptions,
  type AppDialogContextValue,
  type ConfirmDialogOptions,
} from './app-dialog'

type DialogRequest =
  | {
      id: number
      type: 'confirm'
      options: ConfirmDialogOptions
      resolve: (value: boolean) => void
    }
  | {
      id: number
      type: 'alert'
      options: AlertDialogOptions
      resolve: () => void
    }

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([])
  const nextRequestIdRef = useRef(0)
  const queueRef = useRef<DialogRequest[]>([])

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  useEffect(
    () => () => {
      queueRef.current.forEach((request) => {
        if (request.type === 'confirm') {
          request.resolve(false)
          return
        }

        request.resolve()
      })
    },
    [],
  )

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      const request: DialogRequest = {
        id: nextRequestIdRef.current++,
        type: 'confirm',
        options,
        resolve,
      }

      setQueue((current) => [...current, request])
    })
  }, [])

  const alert = useCallback((options: AlertDialogOptions) => {
    return new Promise<void>((resolve) => {
      const request: DialogRequest = {
        id: nextRequestIdRef.current++,
        type: 'alert',
        options,
        resolve,
      }

      setQueue((current) => [...current, request])
    })
  }, [])

  const dismissActiveDialog = useCallback(() => {
    setQueue((current) => {
      const [activeRequest, ...rest] = current
      if (!activeRequest) {
        return current
      }

      if (activeRequest.type === 'confirm') {
        activeRequest.resolve(false)
      } else {
        activeRequest.resolve()
      }

      return rest
    })
  }, [])

  const acceptActiveDialog = useCallback(() => {
    setQueue((current) => {
      const [activeRequest, ...rest] = current
      if (!activeRequest) {
        return current
      }

      if (activeRequest.type === 'confirm') {
        activeRequest.resolve(true)
      } else {
        activeRequest.resolve()
      }

      return rest
    })
  }, [])

  const contextValue = useMemo<AppDialogContextValue>(
    () => ({
      confirm,
      alert,
    }),
    [alert, confirm],
  )

  const activeDialog = queue[0] ?? null

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      {activeDialog && typeof document !== 'undefined'
        ? createPortal(
            <DialogViewport
              key={activeDialog.id}
              activeDialog={activeDialog}
              onAccept={acceptActiveDialog}
              onDismiss={dismissActiveDialog}
            />,
            document.body,
          )
        : null}
    </AppDialogContext.Provider>
  )
}

type DialogViewportProps = {
  activeDialog: DialogRequest
  onAccept: () => void
  onDismiss: () => void
}

function DialogViewport({
  activeDialog,
  onAccept,
  onDismiss,
}: DialogViewportProps) {
  const titleId = useId()
  const descriptionId = useId()
  const {
    title,
    description,
    confirmLabel,
    cancelLabel,
    tone = 'default',
    dismissible = true,
  } = activeDialog.options

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        onDismiss()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dismissible, onDismiss])

  const badgeClasses =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-sky-200 bg-sky-50 text-sky-700'
  const confirmButtonClasses =
    tone === 'danger'
      ? 'bg-rose-600 text-white hover:bg-rose-500 focus-visible:outline-rose-600'
      : 'bg-slate-900 text-white hover:bg-slate-700 focus-visible:outline-slate-900'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
      onClick={dismissible ? onDismiss : undefined}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_32px_80px_-24px_rgba(15,23,42,0.45)]"
        onClick={(event) => event.stopPropagation()}
        role={activeDialog.type === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${badgeClasses}`}
              >
                {activeDialog.type === 'confirm' ? 'Conferma' : 'Messaggio'}
              </span>
              <h2 id={titleId} className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-2 max-w-[44ch] text-sm leading-6 text-slate-600">
                  {description}
                </p>
              ) : null}
            </div>

            {dismissible ? (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:border-slate-400 hover:bg-slate-100"
              >
                Chiudi
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 bg-white px-6 py-5 sm:flex-row sm:justify-end">
          {activeDialog.type === 'confirm' ? (
            <button
              type="button"
              autoFocus
              onClick={onDismiss}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {cancelLabel ?? 'Annulla'}
            </button>
          ) : null}

          <button
            type="button"
            autoFocus={activeDialog.type !== 'confirm'}
            onClick={onAccept}
            className={`rounded-xl px-4 py-2 text-sm font-semibold outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 ${confirmButtonClasses}`}
          >
            {confirmLabel ?? (activeDialog.type === 'confirm' ? 'Conferma' : 'Chiudi')}
          </button>
        </div>
      </div>
    </div>
  )
}
