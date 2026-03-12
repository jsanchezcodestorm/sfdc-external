import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { ApiError } from '../../../lib/api'
import { buildMetadataAdminPath } from '../metadata-admin-utils'
import {
  deployMetadataPackage,
  previewMetadataPackage,
} from '../metadata-admin-api'
import type {
  MetadataDeployResponse,
  MetadataPreviewResponse,
} from '../metadata-admin-types'

type MetadataPreviewLocationState = {
  packageFile?: File
  autoStartPreview?: boolean
}

function isMetadataPreviewLocationState(value: unknown): value is MetadataPreviewLocationState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as MetadataPreviewLocationState
  const fileIsValid = candidate.packageFile === undefined || candidate.packageFile instanceof File
  const autoStartIsValid =
    candidate.autoStartPreview === undefined || typeof candidate.autoStartPreview === 'boolean'

  return fileIsValid && autoStartIsValid
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

export function MetadataAdminPreviewPage() {
  const location = useLocation()
  const locationState = isMetadataPreviewLocationState(location.state) ? location.state : null
  const incomingFile = locationState?.packageFile ?? null
  const autoStartPreview = locationState?.autoStartPreview === true
  const [selectedFile, setSelectedFile] = useState<File | null>(locationState?.packageFile ?? null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [preview, setPreview] = useState<MetadataPreviewResponse | null>(null)
  const [deployResult, setDeployResult] = useState<MetadataDeployResponse | null>(null)
  const autoPreviewLocationKeyRef = useRef<string | null>(null)

  const canDeploy = Boolean(
    preview &&
      selectedFile &&
      preview.hasDeployableEntries &&
      !preview.hasBlockers &&
      !deploying,
  )

  const selectedFileName = useMemo(() => selectedFile?.name ?? null, [selectedFile])

  const executePreview = useCallback(async (file: File) => {
    setPreviewError(null)
    setDeployError(null)
    setDeployResult(null)
    setPreviewing(true)

    try {
      const nextPreview = await previewMetadataPackage(file)
      setPreview(nextPreview)
    } catch (error) {
      setPreview(null)
      setPreviewError(describeApiError(error))
    } finally {
      setPreviewing(false)
    }
  }, [])

  useEffect(() => {
    if (!incomingFile) {
      return
    }

    setSelectedFile(incomingFile)
  }, [incomingFile])

  useEffect(() => {
    if (!incomingFile || !autoStartPreview) {
      return
    }

    if (autoPreviewLocationKeyRef.current === location.key) {
      return
    }

    autoPreviewLocationKeyRef.current = location.key
    void executePreview(incomingFile)
  }, [autoStartPreview, executePreview, incomingFile, location.key])

  async function handlePreview() {
    if (!selectedFile) {
      setPreviewError('Seleziona un file zip da analizzare.')
      return
    }

    await executePreview(selectedFile)
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
      await executePreview(selectedFile)
    } catch (error) {
      setDeployError(describeApiError(error))
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              Metadata Preview
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Preview e deploy package metadata
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Analizza un package zip su una route dedicata, verifica il diff con il target e
              applica il deploy solo dopo il preview coerente.
            </p>
          </div>
          <Link
            to={buildMetadataAdminPath()}
            className="inline-flex rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-900 hover:bg-slate-50"
          >
            Torna ai package
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold text-slate-950">Package zip</h2>
            <p className="mt-2 text-sm text-slate-600">
              Carica un export metadata e lancia il preview. Se arrivi dalla pagina package con
              uno zip selezionato, il preview parte automaticamente.
            </p>
          </div>
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
        </div>

        <label className="mt-5 block rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
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

        {selectedFileName ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            File selezionato: <span className="font-semibold">{selectedFileName}</span>
          </div>
        ) : null}

        {previewError ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {previewError}
          </p>
        ) : null}

        {deployError ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {deployError}
          </p>
        ) : null}

        {deployResult ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Deploy completato. Tipi applicati:{' '}
            {deployResult.applied.map((entry) => `${entry.typeName} (${entry.count})`).join(', ') ||
              'nessuno'}
          </div>
        ) : null}
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
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${classes}`}
    >
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
