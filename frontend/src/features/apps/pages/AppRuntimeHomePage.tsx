import { useParams } from 'react-router-dom'

import { AppPageBlocks } from '../components/AppPageBlocks'
import { useAppWorkspace } from '../useAppWorkspace'

export function AppRuntimeHomePage() {
  const { appId = '' } = useParams()
  const { error, homeItem, loading, selectedApp } = useAppWorkspace()

  if (loading) {
    return <AppRuntimeState title="Caricamento home app..." description="Sto preparando il workspace richiesto." />
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

  if (!homeItem) {
    return (
      <AppRuntimeState
        title="Home non configurata"
        description="L'app non espone una home valida."
        tone="error"
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="rounded-3xl border border-slate-200 bg-white/90 p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          {selectedApp.label}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {homeItem.label}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {homeItem.description?.trim() || selectedApp.description?.trim() || 'Home applicativa configurata.'}
        </p>
      </header>

      <AppPageBlocks app={selectedApp} page={homeItem.page} />
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
