import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { AvailableAppsLauncher } from '../features/apps/components/AvailableAppsLauncher'
import {
  getActiveRuntimeTabEntityId,
  getAppEntityBasePath,
  getFirstAppEntityPath,
  isRuntimeEntityOutsideSelectedApp,
} from '../features/apps/app-workspace-routing'
import { useAppWorkspace } from '../features/apps/useAppWorkspace'
import { useRuntimeNavigation } from './useRuntimeNavigation'

type AppWorkspaceShellProps = {
  children: ReactNode
  onSelectApp: (appId: string) => void
}

export function AppWorkspaceShell({
  children,
  onSelectApp,
}: AppWorkspaceShellProps) {
  const location = useLocation()
  const { apps, error, loading, selectedApp, selectedAppId, selectedEntities } = useAppWorkspace()
  const { closeDrawer, isDrawerOpen } = useRuntimeNavigation()
  const [isLauncherOpen, setIsLauncherOpen] = useState(false)
  const launcherRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isDrawerOpen && !isLauncherOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrawer()
        setIsLauncherOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDrawer, isDrawerOpen, isLauncherOpen])

  useEffect(() => {
    if (!isLauncherOpen) {
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (!launcherRef.current?.contains(event.target as Node)) {
        setIsLauncherOpen(false)
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isLauncherOpen])

  const activeEntityId = getActiveRuntimeTabEntityId(location.pathname, selectedApp)
  const isOutOfContext = isRuntimeEntityOutsideSelectedApp(location.pathname, selectedApp)
  const fallbackEntityPath = getFirstAppEntityPath(selectedApp)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_42%,_#ffffff_100%)] text-slate-900">
      <div className="sticky top-[57px] z-20 hidden border-b border-slate-200/80 bg-white/92 backdrop-blur-sm md:block">
        <div ref={launcherRef} className="relative mx-auto w-full max-w-7xl px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setIsLauncherOpen((current) => !current)}
              className="inline-flex shrink-0 items-center gap-3 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <LauncherGlyph />
              <span>Apps</span>
            </button>

            {loading ? (
              <p className="shrink-0 text-sm text-slate-500">Caricamento entity tabs...</p>
            ) : error ? (
              <p className="shrink-0 text-sm text-rose-700">Launcher non disponibile.</p>
            ) : selectedEntities.length === 0 ? (
              <p className="shrink-0 text-sm text-slate-500">
                Nessuna entity disponibile per l app attiva.
              </p>
            ) : (
              selectedEntities.map((entity) => {
                const isActive = entity.id === activeEntityId

                return (
                  <Link
                    key={entity.id}
                    to={getAppEntityBasePath(entity)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    {entity.label}
                  </Link>
                )
              })
            )}
          </div>

          {isLauncherOpen ? (
            <div className="absolute left-4 top-[calc(100%+0.75rem)] z-50 w-[22rem] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.55)] sm:left-6">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                  App Launcher
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Cambia il contesto di lavoro senza uscire dal workspace corrente.
                </p>
              </div>

              <AvailableAppsLauncher
                apps={apps}
                selectedAppId={selectedAppId}
                loading={loading}
                error={error}
                onSelectApp={(appId) => {
                  onSelectApp(appId)
                  setIsLauncherOpen(false)
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 top-[57px] z-40 md:hidden ${
          isDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div
          aria-hidden={!isDrawerOpen}
          className={`absolute inset-0 bg-slate-950/40 transition ${
            isDrawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={closeDrawer}
        />

        <div
          className={`absolute left-0 top-0 h-full w-[min(24rem,calc(100vw-1rem))] transform border-r border-slate-200 bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] transition ${
            isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
            <section className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                App Launcher
              </p>
              <h2 className="mt-2 text-base font-semibold text-slate-950">
                {selectedApp?.label ?? 'Workspace'}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {selectedApp?.description?.trim() || 'Seleziona l app di lavoro attiva.'}
              </p>
            </section>

            <section className="mt-4">
              <AvailableAppsLauncher
                apps={apps}
                selectedAppId={selectedAppId}
                loading={loading}
                error={error}
                onSelectApp={(appId) => {
                  onSelectApp(appId)
                  closeDrawer()
                }}
              />
            </section>

            <section className="mt-5 flex-1 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600">
                  Entity
                </h3>
                <span className="text-xs font-medium text-slate-500">
                  {selectedEntities.length}
                </span>
              </div>

              {selectedEntities.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Nessuna entity disponibile.</p>
              ) : (
                <nav className="mt-4 space-y-2" aria-label="Entity navigation">
                  {selectedEntities.map((entity) => {
                    const isActive = entity.id === activeEntityId

                    return (
                      <Link
                        key={entity.id}
                        to={getAppEntityBasePath(entity)}
                        onClick={closeDrawer}
                        className={`block rounded-2xl px-4 py-3 transition ${
                          isActive
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                        }`}
                      >
                        <span className="block text-sm font-semibold">{entity.label}</span>
                        <span
                          className={`mt-1 block text-xs ${
                            isActive ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {entity.objectApiName}
                        </span>
                      </Link>
                    )
                  })}
                </nav>
              )}
            </section>
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
        {isOutOfContext ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Entity fuori dall app attiva</p>
                <p className="mt-1 text-sm text-amber-900/85">
                  La route corrente resta aperta, ma non appartiene ai tab dell app selezionata.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/"
                  className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium transition hover:bg-amber-100"
                >
                  Dashboard app
                </Link>
                {fallbackEntityPath ? (
                  <Link
                    to={fallbackEntityPath}
                    className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
                  >
                    Prima entity attiva
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {children}
      </main>
    </div>
  )
}

function LauncherGlyph() {
  return (
    <span className="grid grid-cols-3 gap-0.5" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} className="h-1.5 w-1.5 rounded-full bg-slate-500" />
      ))}
    </span>
  )
}
