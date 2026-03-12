import { useMemo, useState } from 'react'

import { ApiError } from '../../../lib/api'
import {
  deployMetadataPackage,
  exportMetadataPackage,
  previewMetadataPackage,
} from '../metadata-admin-api'
import type {
  MetadataDeployResponse,
  MetadataPreviewResponse,
  MetadataSectionName,
} from '../metadata-admin-types'

type SectionOption = {
  id: MetadataSectionName
  label: string
  caption: string
  deployable: boolean
}

const SECTION_OPTIONS: SectionOption[] = [
  {
    id: 'entities',
    label: 'Entities',
    caption: 'Config list/detail/form e related lists.',
    deployable: true,
  },
  {
    id: 'apps',
    label: 'Apps',
    caption: 'Catalogo app e associazioni entity/permission.',
    deployable: true,
  },
  {
    id: 'acl',
    label: 'ACL',
    caption: 'Permissions, resources e default permissions.',
    deployable: true,
  },
  {
    id: 'aclContactPermissions',
    label: 'ACL Contact',
    caption: 'Permission esplicite per Contact via email mapping.',
    deployable: true,
  },
  {
    id: 'queryTemplates',
    label: 'Query Templates',
    caption: 'Template SOQL amministrativi.',
    deployable: true,
  },
  {
    id: 'visibility',
    label: 'Visibility',
    caption: 'Cones, rules e assignments.',
    deployable: true,
  },
  {
    id: 'authProviders',
    label: 'Auth Providers',
    caption: 'Solo inventory manuale, senza secret.',
    deployable: false,
  },
  {
    id: 'localCredentials',
    label: 'Local Credentials',
    caption: 'Solo inventory manuale, senza password hash.',
    deployable: false,
  },
]

const DEFAULT_SELECTION = Object.fromEntries(
  SECTION_OPTIONS.map((option) => [option.id, true]),
) as Record<MetadataSectionName, boolean>

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Operazione non riuscita'
}

export function MetadataAdminPage() {
  const [selectedSections, setSelectedSections] =
    useState<Record<MetadataSectionName, boolean>>(DEFAULT_SELECTION)
  const [exportError, setExportError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<MetadataPreviewResponse | null>(null)
  const [deployResult, setDeployResult] = useState<MetadataDeployResponse | null>(null)

  const selectedSectionIds = useMemo(
    () =>
      SECTION_OPTIONS.filter((option) => selectedSections[option.id]).map((option) => option.id),
    [selectedSections],
  )

  const canDeploy = Boolean(
    preview &&
      selectedFile &&
      preview.hasDeployableEntries &&
      !preview.hasBlockers &&
      !deploying,
  )

  async function handleExport() {
    setExportError(null)
    setPreviewError(null)
    setDeployError(null)
    setDeployResult(null)

    if (selectedSectionIds.length === 0) {
      setExportError('Seleziona almeno una sezione da esportare.')
      return
    }

    setExporting(true)
    try {
      const response = await exportMetadataPackage(selectedSectionIds)
      downloadBlob(response.blob, response.filename)
    } catch (error) {
      setExportError(describeApiError(error))
    } finally {
      setExporting(false)
    }
  }

  async function handlePreview() {
    setPreviewError(null)
    setDeployError(null)
    setDeployResult(null)

    if (!selectedFile) {
      setPreviewError('Seleziona un file zip da analizzare.')
      return
    }

    setPreviewing(true)
    try {
      const nextPreview = await previewMetadataPackage(selectedFile)
      setPreview(nextPreview)
    } catch (error) {
      setPreview(null)
      setPreviewError(describeApiError(error))
    } finally {
      setPreviewing(false)
    }
  }

  async function handleDeploy() {
    setDeployError(null)
    setDeployResult(null)

    if (!selectedFile || !preview) {
      setDeployError('Esegui prima il preview del package.')
      return
    }

    setDeploying(true)
    try {
      const result = await deployMetadataPackage(
        selectedFile,
        preview.packageHash,
        preview.targetFingerprint,
      )
      setDeployResult(result)
      const refreshedPreview = await previewMetadataPackage(selectedFile)
      setPreview(refreshedPreview)
    } catch (error) {
      setDeployError(describeApiError(error))
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              Metadata Packages
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Retrieve e deploy admin via zip YAML
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Genera package zip con file YAML versionabili, analizza differenze con il target
              e applica solo i tipi deployable presenti nel package. I file assenti non
              eliminano nulla.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {exporting ? 'Export in corso...' : 'Scarica package zip'}
          </button>
        </div>
        {exportError ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {exportError}
          </p>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Contenuto export</h2>
          <p className="mt-2 text-sm text-slate-600">
            Scegli le sezioni da includere nello zip. Le sezioni manual-only vengono esportate
            come inventory, ma non sono deployabili.
          </p>
          <div className="mt-5 grid gap-3">
            {SECTION_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={selectedSections[option.id]}
                  onChange={(event) =>
                    setSelectedSections((current) => ({
                      ...current,
                      [option.id]: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-950">{option.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        option.deployable
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {option.deployable ? 'Deployable' : 'Manual'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{option.caption}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Preview / Deploy</h2>
          <p className="mt-2 text-sm text-slate-600">
            Carica un package zip già esportato, verifica blocker e manual actions, poi
            lancia il deploy con fingerprint coerente al preview.
          </p>
          <div className="mt-5 space-y-4">
            <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
              <span className="block text-sm font-medium text-slate-900">Package zip</span>
              <span className="mt-1 block text-sm text-slate-500">
                Seleziona il file `.zip` generato dalla retrieve metadata.
              </span>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null
                  setSelectedFile(nextFile)
                  setPreview(null)
                  setDeployResult(null)
                  setPreviewError(null)
                  setDeployError(null)
                }}
                className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
              />
            </label>

            {selectedFile ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                File selezionato: <span className="font-semibold">{selectedFile.name}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={!selectedFile || previewing}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                {previewing ? 'Preview in corso...' : 'Esegui preview'}
              </button>
              <button
                type="button"
                onClick={() => void handleDeploy()}
                disabled={!canDeploy}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {deploying ? 'Deploy in corso...' : 'Deploy package'}
              </button>
            </div>

            {previewError ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {previewError}
              </p>
            ) : null}

            {deployError ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {deployError}
              </p>
            ) : null}

            {deployResult ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Deploy completato. Tipi applicati:{' '}
                {deployResult.applied.map((entry) => `${entry.typeName} (${entry.count})`).join(', ') ||
                  'nessuno'}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {preview ? (
        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Deploy mode" value={preview.package.deployMode} />
            <MetricCard
              label="Deployable entries"
              value={String(preview.items.filter((item) => item.category === 'deployable').length)}
            />
            <MetricCard label="Warnings" value={String(preview.warnings.length)} />
            <MetricCard label="Blockers" value={String(preview.blockers.length)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Preview diff</h2>
              <p className="mt-2 text-sm text-slate-600">
                Confronto tra il package caricato e lo stato attuale del target. `sourceId` dei
                riferimenti Contact viene ignorato nel diff.
              </p>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Change</th>
                      <th className="px-4 py-3">Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {preview.items.map((item) => (
                      <tr key={item.path} className="align-top">
                        <td className="px-4 py-3 font-medium text-slate-900">{item.typeName}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{item.member}</div>
                          <div className="mt-1 text-xs text-slate-400">{item.path}</div>
                          {item.warnings.map((warning) => (
                            <div
                              key={warning}
                              className="mt-2 rounded-xl bg-amber-50 px-2.5 py-2 text-xs text-amber-800"
                            >
                              {warning}
                            </div>
                          ))}
                          {item.blockers.map((blocker) => (
                            <div
                              key={blocker}
                              className="mt-2 rounded-xl bg-rose-50 px-2.5 py-2 text-xs text-rose-700"
                            >
                              {blocker}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3">
                          <ChangeBadge change={item.change} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              item.category === 'deployable'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {item.category}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <StatusPanel
                title="Package"
                lines={[
                  `Format: ${preview.package.format}`,
                  `Version: ${preview.package.version}`,
                  `Package hash: ${preview.packageHash}`,
                  `Target fingerprint: ${preview.targetFingerprint}`,
                ]}
              />
              <StatusPanel title="Warnings" lines={preview.warnings} tone="warning" />
              <StatusPanel title="Blockers" lines={preview.blockers} tone="danger" />
              <StatusPanel title="Manual actions" lines={preview.manualActions} tone="neutral" />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function ChangeBadge({ change }: { change: 'create' | 'update' | 'unchanged' }) {
  const classes =
    change === 'create'
      ? 'bg-emerald-100 text-emerald-700'
      : change === 'update'
      ? 'bg-sky-100 text-sky-700'
      : 'bg-slate-100 text-slate-700'

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${classes}`}>
      {change}
    </span>
  )
}

function StatusPanel({
  title,
  lines,
  tone = 'neutral',
}: {
  title: string
  lines: string[]
  tone?: 'neutral' | 'warning' | 'danger'
}) {
  const toneClasses =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'danger'
      ? 'border-rose-200 bg-rose-50'
      : 'border-slate-200 bg-slate-50'

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses}`}>
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-slate-700">
        {lines.length > 0 ? (
          lines.map((line) => <p key={line}>{line}</p>)
        ) : (
          <p className="text-slate-500">Nessun elemento.</p>
        )}
      </div>
    </div>
  )
}
