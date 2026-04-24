import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  fetchAppAdmin,
  fetchAppDashboardOptions,
  updateAppHomeAdmin,
} from '../apps-admin-api'
import type {
  AppDashboardOption,
  AppHomeItemConfig,
  AppItemConfig,
} from '../apps-admin-types'
import {
  buildAppsAdminEditPath,
  buildAppsAdminViewPath,
} from '../apps-admin-utils'
import type {
  AppPageAction,
  AppPageBlock,
  AppPageBlockLayout,
} from '../../apps/app-types'

type RouteParams = {
  appId?: string
}

type HomeDraft = {
  label: string
  description: string
  blocks: AppPageBlock[]
}

const GRID_COL_OPTIONS = [12, 6, 4]
const GRID_ROW_OPTIONS = [1, 2, 3, 4, 5, 6]

export function AppsAdminHomeBuilderPage() {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const appId = params.appId ? decodeURIComponent(params.appId) : ''
  const [draft, setDraft] = useState<HomeDraft | null>(null)
  const [appItems, setAppItems] = useState<AppItemConfig[]>([])
  const [dashboardOptions, setDashboardOptions] = useState<AppDashboardOption[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    let cancelled = false

    if (!appId) {
      setLoading(false)
      setPageError('App ID mancante')
      return
    }

    setLoading(true)
    void Promise.all([fetchAppAdmin(appId), fetchAppDashboardOptions(appId)])
      .then(([appPayload, dashboardPayload]) => {
        if (cancelled) {
          return
        }

        const home = appPayload.app.items.find((item): item is AppHomeItemConfig => item.kind === 'home')
        if (!home) {
          throw new Error('Home non configurata')
        }

        setDraft({
          label: home.label,
          description: home.description ?? '',
          blocks: home.page.blocks,
        })
        setSelectedBlockId(home.page.blocks[0]?.id ?? null)
        setAppItems(appPayload.app.items)
        setDashboardOptions(dashboardPayload.items)
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setDraft(null)
        setAppItems([])
        setDashboardOptions([])
        setSelectedBlockId(null)
        setPageError(error instanceof Error ? error.message : 'Errore caricamento home builder')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [appId])

  const selectedBlock = useMemo(
    () => draft?.blocks.find((block) => block.id === selectedBlockId) ?? null,
    [draft?.blocks, selectedBlockId],
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!draft || !over || active.id === over.id) {
      return
    }

    const oldIndex = draft.blocks.findIndex((block) => block.id === active.id)
    const newIndex = draft.blocks.findIndex((block) => block.id === over.id)
    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    setDraft((current) =>
      current
        ? {
            ...current,
            blocks: arrayMove(current.blocks, oldIndex, newIndex),
          }
        : current,
    )
  }

  const addBlock = (type: AppPageBlock['type']) => {
    const block = createDefaultBlock(type, dashboardOptions[0]?.id)
    setDraft((current) =>
      current
        ? {
            ...current,
            blocks: [...current.blocks, block],
          }
        : current,
    )
    setSelectedBlockId(block.id)
  }

  const updateBlock = (blockId: string, updater: (block: AppPageBlock) => AppPageBlock) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            blocks: current.blocks.map((block) => (block.id === blockId ? updater(block) : block)),
          }
        : current,
    )
  }

  const removeBlock = (blockId: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            blocks: current.blocks.filter((block) => block.id !== blockId),
          }
        : current,
    )
    setSelectedBlockId((current) => (current === blockId ? null : current))
  }

  const save = async () => {
    if (!draft) {
      return
    }

    if (draft.label.trim().length === 0) {
      setPageError('La label della home è obbligatoria')
      return
    }

    setSaving(true)
    setPageError(null)

    try {
      await updateAppHomeAdmin(appId, {
        id: 'home',
        kind: 'home',
        label: draft.label.trim(),
        description: draft.description.trim() || undefined,
        page: {
          blocks: draft.blocks,
        },
      })
      navigate(buildAppsAdminViewPath(appId), { replace: true })
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Errore salvataggio home')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Home Builder</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{appId || 'App'}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Configura la home applicativa in una griglia visuale. In v1 il preview dashboard nel builder è strutturale, mentre i dati live compaiono nel runtime utente.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(buildAppsAdminViewPath(appId))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Overview app
          </button>
          <button
            type="button"
            onClick={() => navigate(buildAppsAdminEditPath(appId))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Edit app
          </button>
          <button
            type="button"
            onClick={() => {
              void save()
            }}
            disabled={loading || saving || !draft}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva home'}
          </button>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento builder...</p>
      ) : draft ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="text-sm font-medium text-slate-700">
                    Label home
                    <input
                      type="text"
                      value={draft.label}
                      onChange={(event) =>
                        setDraft((current) => (current ? { ...current, label: event.target.value } : current))
                      }
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                    Descrizione home
                    <textarea
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((current) =>
                          current ? { ...current, description: event.target.value } : current,
                        )
                      }
                      rows={3}
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Blocchi disponibili</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Hero, markdown, lista link e dashboard embeddabili live nel runtime utente.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PaletteButton label="Hero" onClick={() => addBlock('hero')} />
                    <PaletteButton label="Markdown" onClick={() => addBlock('markdown')} />
                    <PaletteButton label="Link List" onClick={() => addBlock('link-list')} />
                    <PaletteButton
                      label="Dashboard"
                      onClick={() => addBlock('dashboard')}
                      disabled={dashboardOptions.length === 0}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Canvas home</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Ordina i blocchi con drag and drop. Il runtime mobile impila sempre a colonna singola.
                    </p>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {draft.blocks.length} blocchi
                  </p>
                </div>

                <div className="mt-4">
                  {draft.blocks.length ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext items={draft.blocks.map((block) => block.id)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-12 gap-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                          {draft.blocks.map((block) => (
                            <SortableHomeBlockCard
                              key={block.id}
                              block={block}
                              isSelected={selectedBlockId === block.id}
                              dashboardOption={
                                block.type === 'dashboard'
                                  ? dashboardOptions.find((option) => option.id === block.dashboardId) ?? null
                                  : null
                              }
                              onSelect={() => setSelectedBlockId(block.id)}
                              onRemove={() => removeBlock(block.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                      Nessun blocco configurato. Aggiungi il primo componente dalla palette.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-700">Inspector</p>
              <p className="mt-1 text-xs text-slate-500">
                Seleziona un blocco dal canvas per configurarne contenuto, layout e target.
              </p>

              {selectedBlock ? (
                <div className="mt-4 space-y-5">
                  <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      {selectedBlock.type}
                    </p>
                    <p className="mt-2 font-mono text-xs text-slate-500">{selectedBlock.id}</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">
                        Col span
                        <select
                          value={selectedBlock.layout.colSpan}
                          onChange={(event) =>
                            updateBlock(selectedBlock.id, (block) => ({
                              ...block,
                              layout: {
                                ...block.layout,
                                colSpan: Number.parseInt(event.target.value, 10),
                              },
                            }))
                          }
                          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        >
                          {GRID_COL_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm font-medium text-slate-700">
                        Row span
                        <select
                          value={selectedBlock.layout.rowSpan}
                          onChange={(event) =>
                            updateBlock(selectedBlock.id, (block) => ({
                              ...block,
                              layout: {
                                ...block.layout,
                                rowSpan: Number.parseInt(event.target.value, 10),
                              },
                            }))
                          }
                          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        >
                          {GRID_ROW_OPTIONS
                            .filter((value) => selectedBlock.type !== 'dashboard' || value >= 4)
                            .map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  </section>

                  <BlockEditor
                    block={selectedBlock}
                    appItems={appItems}
                    dashboardOptions={dashboardOptions}
                    onChange={(nextBlock) => updateBlock(selectedBlock.id, () => nextBlock)}
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Nessun blocco selezionato.
                </div>
              )}
            </aside>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function PaletteButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      + {label}
    </button>
  )
}

function SortableHomeBlockCard({
  block,
  isSelected,
  dashboardOption,
  onSelect,
  onRemove,
}: {
  block: AppPageBlock
  isSelected: boolean
  dashboardOption: AppDashboardOption | null
  onSelect: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: block.id,
  })

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        gridColumn: `span ${block.layout.colSpan} / span ${block.layout.colSpan}`,
        minHeight: `${block.layout.rowSpan * 6.5}rem`,
      }}
      className={`rounded-2xl border p-4 shadow-sm transition ${
        isSelected
          ? 'border-sky-400 bg-sky-50/60'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{block.type}</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{describeBlockTitle(block, dashboardOption)}</p>
          <p className="mt-1 text-xs text-slate-500">{describeBlockBody(block, dashboardOption)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 hover:border-slate-400 hover:bg-slate-50"
          >
            Drag
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 hover:bg-rose-50"
          >
            Remove
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          {block.layout.colSpan}/12
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          h {block.layout.rowSpan}
        </span>
      </div>
    </article>
  )
}

function BlockEditor({
  block,
  appItems,
  dashboardOptions,
  onChange,
}: {
  block: AppPageBlock
  appItems: AppItemConfig[]
  dashboardOptions: AppDashboardOption[]
  onChange: (block: AppPageBlock) => void
}) {
  if (block.type === 'hero') {
    return (
      <section className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Titolo
          <input
            type="text"
            value={block.title}
            onChange={(event) => onChange({ ...block, title: event.target.value })}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Body
          <textarea
            value={block.body ?? ''}
            onChange={(event) => onChange({ ...block, body: event.target.value || undefined })}
            rows={5}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>
        <ActionEditor
          title="CTA hero"
          action={block.action ?? null}
          appItems={appItems}
          onChange={(action) => onChange({ ...block, action: action ?? undefined })}
        />
      </section>
    )
  }

  if (block.type === 'markdown') {
    return (
      <label className="block text-sm font-medium text-slate-700">
        Markdown
        <textarea
          value={block.markdown}
          onChange={(event) => onChange({ ...block, markdown: event.target.value })}
          rows={12}
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </label>
    )
  }

  if (block.type === 'link-list') {
    return (
      <section className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Titolo lista
          <input
            type="text"
            value={block.title ?? ''}
            onChange={(event) => onChange({ ...block, title: event.target.value || undefined })}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <div className="space-y-3">
          {block.links.map((link, index) => (
            <ActionEditor
              key={`${block.id}-link-${index}`}
              title={`Link ${index + 1}`}
              action={link}
              appItems={appItems}
              onChange={(nextAction) => {
                if (!nextAction) {
                  onChange({
                    ...block,
                    links: block.links.filter((_, linkIndex) => linkIndex !== index),
                  })
                  return
                }

                onChange({
                  ...block,
                  links: block.links.map((entry, linkIndex) => (linkIndex === index ? nextAction : entry)),
                })
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            onChange({
              ...block,
              links: [...block.links, createDefaultAction()],
            })
          }
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          + Aggiungi link
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        Dashboard
        <select
          value={block.dashboardId}
          onChange={(event) => onChange({ ...block, dashboardId: event.target.value })}
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        >
          <option value="">Seleziona dashboard</option>
          {dashboardOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} · {option.folderLabel}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        Il blocco usa sempre la dashboard live esistente, con gli stessi widget e filtri runtime del modulo dashboard. Gli utenti senza accesso vedranno un placeholder di accesso negato.
      </div>
    </section>
  )
}

function ActionEditor({
  title,
  action,
  appItems,
  onChange,
}: {
  title: string
  action: AppPageAction | null
  appItems: AppItemConfig[]
  onChange: (action: AppPageAction | null) => void
}) {
  if (!action) {
    return (
      <button
        type="button"
        onClick={() => onChange(createDefaultAction())}
        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        + {title}
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 hover:bg-rose-50"
        >
          Remove
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Label
          <input
            type="text"
            value={action.label}
            onChange={(event) => onChange({ ...action, label: event.target.value })}
            className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Target type
            <select
              value={action.targetType}
              onChange={(event) =>
                onChange({
                  ...action,
                  targetType: event.target.value as AppPageAction['targetType'],
                  target:
                    event.target.value === 'app-item'
                      ? appItems[0]?.id ?? 'home'
                      : '',
                })
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="app-item">App item</option>
              <option value="url">URL</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Open mode
            <select
              value={action.openMode ?? 'same-tab'}
              onChange={(event) =>
                onChange({
                  ...action,
                  openMode: event.target.value === 'same-tab' ? undefined : 'new-tab',
                })
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="same-tab">Same tab</option>
              <option value="new-tab">New tab</option>
            </select>
          </label>
        </div>

        {action.targetType === 'app-item' ? (
          <label className="block text-sm font-medium text-slate-700">
            Item target
            <select
              value={action.target}
              onChange={(event) => onChange({ ...action, target: event.target.value })}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              {appItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} ({item.id})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block text-sm font-medium text-slate-700">
            URL
            <input
              type="url"
              value={action.target}
              onChange={(event) => onChange({ ...action, target: event.target.value })}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        )}
      </div>
    </section>
  )
}

function createDefaultBlock(type: AppPageBlock['type'], defaultDashboardId?: string): AppPageBlock {
  const id = `${type}-${crypto.randomUUID()}`
  const layout = createDefaultBlockLayout(type)

  switch (type) {
    case 'hero':
      return {
        id,
        type,
        layout,
        title: 'Nuovo hero',
        body: '',
      }
    case 'markdown':
      return {
        id,
        type,
        layout,
        markdown: '## Titolo\nDescrizione contenuto',
      }
    case 'link-list':
      return {
        id,
        type,
        layout,
        title: 'Quick links',
        links: [createDefaultAction()],
      }
    case 'dashboard':
      return {
        id,
        type,
        layout,
        dashboardId: defaultDashboardId ?? '',
      }
  }
}

function createDefaultAction(): AppPageAction {
  return {
    label: 'Apri',
    targetType: 'app-item',
    target: 'home',
  }
}

function createDefaultBlockLayout(type: AppPageBlock['type']): AppPageBlockLayout {
  switch (type) {
    case 'hero':
      return { colSpan: 12, rowSpan: 2 }
    case 'markdown':
      return { colSpan: 6, rowSpan: 2 }
    case 'link-list':
      return { colSpan: 6, rowSpan: 2 }
    case 'dashboard':
      return { colSpan: 12, rowSpan: 4 }
  }
}

function describeBlockTitle(block: AppPageBlock, dashboardOption: AppDashboardOption | null): string {
  switch (block.type) {
    case 'hero':
      return block.title || 'Hero'
    case 'markdown':
      return 'Blocco markdown'
    case 'link-list':
      return block.title || 'Lista link'
    case 'dashboard':
      return dashboardOption?.label || 'Dashboard da selezionare'
  }
}

function describeBlockBody(block: AppPageBlock, dashboardOption: AppDashboardOption | null): string {
  switch (block.type) {
    case 'hero':
      return block.body?.trim() || 'Hero introduttivo senza body'
    case 'markdown':
      return block.markdown.split(/\r?\n/).find((line) => line.trim().length > 0) || 'Markdown vuoto'
    case 'link-list':
      return `${block.links.length} link configurati`
    case 'dashboard':
      return dashboardOption
        ? `${dashboardOption.folderLabel} · ${dashboardOption.widgetCount} widget`
        : 'Nessuna dashboard selezionata'
  }
}
