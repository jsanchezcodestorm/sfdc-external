import { useParams } from 'react-router-dom'

import { AppPageBlocks } from '../components/AppPageBlocks'
import { findItemInApp } from '../app-workspace-routing'
import { useAppWorkspace } from '../useAppWorkspace'
import { DashboardRuntimeWorkspace } from '../../dashboards/DashboardRuntimeWorkspace'
import { ReportRuntimeWorkspace } from '../../reports/ReportRuntimeWorkspace'

export function AppRuntimeItemPage() {
  const { appId = '', itemId = '' } = useParams()
  const { error, loading, selectedApp } = useAppWorkspace()

  if (loading) {
    return <AppRuntimeState title="Caricamento item app..." description="Sto preparando il contenuto richiesto." />
  }

  if (error) {
    return <AppRuntimeState title="Workspace non disponibile" description={error} tone="error" />
  }

  if (!selectedApp || selectedApp.id !== appId) {
    return (
      <AppRuntimeState
        title="App non disponibile"
        description="L'app richiesta non è disponibile per la sessione corrente."
        tone="error"
      />
    )
  }

  const item = findItemInApp(selectedApp, itemId)

  if (!item || item.kind === 'home' || item.kind === 'entity') {
    return (
      <AppRuntimeState
        title="Item non disponibile"
        description="L'item richiesto non appartiene all'app corrente o non è navigabile tramite questa route."
        tone="error"
      />
    )
  }

  if (item.kind === 'custom-page') {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-3xl border border-slate-200 bg-white/90 p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            {selectedApp.label}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {item.label}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {item.description?.trim() || 'Pagina applicativa configurata.'}
          </p>
        </header>

        <AppPageBlocks app={selectedApp} page={item.page} />
      </div>
    )
  }

  if (item.kind === 'report') {
    return (
      <ReportRuntimeWorkspace
        appId={appId}
        itemId={itemId}
        appLabel={selectedApp.label}
        itemLabel={item.label}
        itemDescription={item.description}
      />
    )
  }

  if (item.kind === 'dashboard') {
    return (
      <DashboardRuntimeWorkspace
        appId={appId}
        itemId={itemId}
        appLabel={selectedApp.label}
        itemLabel={item.label}
        itemDescription={item.description}
      />
    )
  }

  if (item.openMode === 'new-tab') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">{item.label}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {item.description?.trim() ||
            'Questo contenuto è configurato per l’apertura in una nuova tab.'}
        </p>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Apri in nuova tab
        </a>
      </section>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="rounded-3xl border border-slate-200 bg-white/90 p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          {selectedApp.label}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {item.label}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {item.description?.trim() || 'Embed esterno configurato.'}
        </p>
      </header>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <iframe
          title={item.iframeTitle?.trim() || item.label}
          src={item.url}
          className="w-full border-0"
          style={{ height: item.height ?? 860 }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </section>
    </div>
  )
}

function AppRuntimeState({
  title,
  description,
  tone = 'neutral',
}: {
  title: string
  description: string
  tone?: 'neutral' | 'error'
}) {
  return (
    <section
      className={`rounded-2xl border px-5 py-5 shadow-sm ${
        tone === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-white text-slate-700'
      }`}
    >
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm">{description}</p>
    </section>
  )
}
