import { useMemo, useState } from 'react'

import { ApiError } from '../../../lib/api'
import { exportMetadataPackage } from '../metadata-admin-api'
import type { MetadataSectionName } from '../metadata-admin-types'

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
  const [exporting, setExporting] = useState(false)

  const selectedSectionIds = useMemo(
    () =>
      SECTION_OPTIONS.filter((option) => selectedSections[option.id]).map((option) => option.id),
    [selectedSections],
  )

  async function handleExport() {
    setExportError(null)

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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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
      </section>
    </div>
  )
}
