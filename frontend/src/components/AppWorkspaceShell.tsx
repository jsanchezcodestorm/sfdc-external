import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { AvailableAppsLauncher } from '../features/apps/components/AvailableAppsLauncher'
import {
  getActiveRuntimeTabKey,
  getAppItemHref,
} from '../features/apps/app-workspace-routing'
import { useAppWorkspace } from '../features/apps/useAppWorkspace'
import type { AvailableAppItem } from '../features/apps/app-types'
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
  const { apps, error, loading, selectedApp, selectedAppId, selectedItems } = useAppWorkspace()
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

  const activeTabKey = getActiveRuntimeTabKey(location.pathname, selectedApp)

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
              <p className="shrink-0 text-sm text-slate-500">Caricamento navigazione app...</p>
            ) : error ? (
              <p className="shrink-0 text-sm text-rose-700">Launcher non disponibile.</p>
            ) : selectedItems.length === 0 ? (
              <p className="shrink-0 text-sm text-slate-500">
                Nessun item disponibile per l app attiva.
              </p>
            ) : (
              selectedItems.map((item) => (
                <WorkspaceNavItem
                  key={item.id}
                  appId={selectedApp?.id}
                  item={item}
                  isActive={item.kind === 'home' ? activeTabKey === 'home' : activeTabKey === item.id}
                />
              ))
            )}
          </div>

          {isLauncherOpen ? (
            <div className="absolute left-4 top-[calc(100%+0.75rem)] z-50 w-[22rem] rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.55)] sm:left-6">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                  App Launcher
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Cambia il contesto di lavoro e atterra sempre sulla home dell app selezionata.
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
                  Navigation
                </h3>
                <span className="text-xs font-medium text-slate-500">
                  {selectedItems.length}
                </span>
              </div>

              {selectedItems.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Nessun item disponibile.</p>
              ) : (
                <nav className="mt-4 space-y-2" aria-label="App navigation">
                  {selectedItems.map((item) => (
                    <WorkspaceNavItem
                      key={item.id}
                      appId={selectedApp?.id}
                      item={item}
                      isActive={item.kind === 'home' ? activeTabKey === 'home' : activeTabKey === item.id}
                      compact
                      onNavigate={closeDrawer}
                    />
                  ))}
                </nav>
              )}
            </section>
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  )
}

type WorkspaceNavItemProps = {
  appId: string | undefined
  item: AvailableAppItem
  isActive: boolean
  compact?: boolean
  onNavigate?: () => void
}

function WorkspaceNavItem({
  appId,
  item,
  isActive,
  compact = false,
  onNavigate,
}: WorkspaceNavItemProps) {
  const href = appId ? getAppItemHref(appId, item) : null
  const baseClassName = compact
    ? `block rounded-2xl px-4 py-3 transition ${
        isActive
          ? 'bg-slate-900 text-white'
          : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950'
      }`
    : `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
        isActive
          ? 'bg-slate-900 text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`

  const content = compact ? (
    <>
      <span className="block text-sm font-semibold">{item.label}</span>
      <span
        className={`mt-1 block text-xs ${
          isActive ? 'text-slate-300' : 'text-slate-500'
        }`}
      >
        {describeItem(item)}
      </span>
    </>
  ) : (
    item.label
  )

  if (!href) {
    return (
      <span className={`${baseClassName} opacity-60`}>
        {content}
      </span>
    )
  }

  if (item.kind === 'external-link' && item.openMode === 'new-tab') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        className={baseClassName}
      >
        {content}
      </a>
    )
  }

  return (
    <Link to={href} onClick={onNavigate} className={baseClassName}>
      {content}
    </Link>
  )
}

function describeItem(item: AvailableAppItem): string {
  switch (item.kind) {
    case 'home':
      return 'Home'
    case 'entity':
      return item.objectApiName
    case 'custom-page':
      return 'Custom page'
    case 'external-link':
      return item.openMode === 'iframe' ? 'Embed esterno' : 'Nuova tab'
    case 'report':
      return 'Report'
  }
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
