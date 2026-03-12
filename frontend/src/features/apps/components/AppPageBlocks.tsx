import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { AppPageAction, AppPageConfig, AvailableApp } from '../app-types'
import { buildAppHomePath, findItemInApp, getAppItemInternalPath } from '../app-workspace-routing'

type AppPageBlocksProps = {
  app: AvailableApp
  page: AppPageConfig
}

export function AppPageBlocks({ app, page }: AppPageBlocksProps) {
  if (page.blocks.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Nessun contenuto configurato per questa pagina.</p>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {page.blocks.map((block, index) => {
        if (block.type === 'hero') {
          return (
            <section
              key={`${block.type}-${index}`}
              className="rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#e0f2fe_100%)] p-7 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                App Home
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {block.title}
              </h2>
              {block.body ? (
                <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-slate-600">
                  {block.body}
                </p>
              ) : null}
              {block.action ? (
                <div className="mt-6">
                  <AppPageActionButton app={app} action={block.action} primary />
                </div>
              ) : null}
            </section>
          )
        }

        if (block.type === 'markdown') {
          return (
            <section key={`${block.type}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <MarkdownText markdown={block.markdown} />
            </section>
          )
        }

        return (
          <section key={`${block.type}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {block.title ? (
              <h3 className="text-lg font-semibold text-slate-950">{block.title}</h3>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              {block.links.map((link, linkIndex) => (
                <AppPageActionButton key={`${link.label}-${linkIndex}`} app={app} action={link} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function AppPageActionButton({
  app,
  action,
  primary = false,
}: {
  app: AvailableApp
  action: AppPageAction
  primary?: boolean
}) {
  const className = primary
    ? 'inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700'
    : 'inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50'

  if (action.targetType === 'url') {
    if (action.openMode === 'new-tab') {
      return (
        <a href={action.target} target="_blank" rel="noreferrer" className={className}>
          {action.label}
        </a>
      )
    }

    return (
      <a href={action.target} className={className}>
        {action.label}
      </a>
    )
  }

  const targetItem = findItemInApp(app, action.target)
  const href = targetItem ? getAppItemInternalPath(app.id, targetItem) : buildAppHomePath(app.id)

  return (
    <Link to={href ?? buildAppHomePath(app.id)} className={className}>
      {action.label}
    </Link>
  )
}

function MarkdownText({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/)
  const elements: ReactNode[] = []
  let bulletItems: string[] = []

  const flushBulletItems = () => {
    if (bulletItems.length === 0) {
      return
    }

    elements.push(
      <ul key={`list-${elements.length}`} className="ml-5 list-disc space-y-2 text-sm leading-7 text-slate-700">
        {bulletItems.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>,
    )
    bulletItems = []
  }

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (!trimmed) {
      flushBulletItems()
      return
    }

    if (trimmed.startsWith('- ')) {
      bulletItems.push(trimmed.slice(2))
      return
    }

    flushBulletItems()

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h4 key={`h4-${elements.length}`} className="text-lg font-semibold text-slate-950">
          {trimmed.slice(3)}
        </h4>,
      )
      return
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <h3 key={`h3-${elements.length}`} className="text-xl font-semibold text-slate-950">
          {trimmed.slice(2)}
        </h3>,
      )
      return
    }

    elements.push(
      <p key={`p-${elements.length}`} className="text-sm leading-7 text-slate-700">
        {trimmed}
      </p>,
    )
  })

  flushBulletItems()

  return <div className="space-y-3">{elements}</div>
}
