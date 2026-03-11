import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import {
  fetchAuthAdminProvider,
  fetchAuthAdminProviders,
  updateAuthAdminProvider,
} from '../auth-admin-api'
import type {
  AuthAdminProviderDetailItem,
  AuthAdminProviderInput,
  AuthAdminProviderItem,
} from '../auth-admin-types'
import {
  buildAuthAdminProviderEditPath,
  buildAuthAdminProvidersPath,
} from '../auth-admin-utils'
import { AuthProviderQuickSetupCard } from '../components/AuthProviderQuickSetupCard'

type AuthAdminProviderEditorPageProps = {
  mode: 'create' | 'edit'
}

type ProviderFormState = {
  label: string
  enabled: boolean
  sortOrder: string
  clientId: string
  clientSecret: string
  tenantId: string
  domain: string
  issuer: string
  scopesText: string
}

const EMPTY_FORM_STATE: ProviderFormState = {
  label: '',
  enabled: true,
  sortOrder: '0',
  clientId: '',
  clientSecret: '',
  tenantId: '',
  domain: '',
  issuer: '',
  scopesText: 'openid, email, profile',
}

export function AuthAdminProviderEditorPage({
  mode,
}: AuthAdminProviderEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<{ providerId?: string }>()
  const routeProviderId = params.providerId ? decodeURIComponent(params.providerId) : ''
  const [items, setItems] = useState<AuthAdminProviderItem[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedDetail, setSelectedDetail] = useState<AuthAdminProviderDetailItem | null>(null)
  const [formState, setFormState] = useState<ProviderFormState>(EMPTY_FORM_STATE)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label),
      ),
    [items],
  )
  const oidcItems = useMemo(
    () => sortedItems.filter((item) => item.type === 'oidc'),
    [sortedItems],
  )
  const selectableItems = mode === 'create' ? oidcItems : sortedItems
  const targetProviderId = mode === 'edit' ? routeProviderId : selectedProviderId

  useEffect(() => {
    let cancelled = false

    void fetchAuthAdminProviders()
      .then((payload) => {
        if (cancelled) {
          return
        }

        setItems(payload.items ?? [])
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Errore caricamento provider auth'
        setItems([])
        setPageError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (mode !== 'create' || selectedProviderId || oidcItems.length === 0) {
      return
    }

    const preferredProvider =
      oidcItems.find((item) => item.status === 'not_configured') ??
      oidcItems[0]

    setSelectedProviderId(preferredProvider.id)
  }, [mode, oidcItems, selectedProviderId])

  useEffect(() => {
    if (!targetProviderId) {
      setSelectedDetail(null)
      setFormState(EMPTY_FORM_STATE)
      return
    }

    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setCopyFeedback(null)

    void fetchAuthAdminProvider(targetProviderId)
      .then((payload) => {
        if (cancelled) {
          return
        }

        setSelectedDetail(payload.provider)
        setFormState(toFormState(payload.provider))
        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : `Errore caricamento provider ${targetProviderId}`
        setSelectedDetail(null)
        setFormState(EMPTY_FORM_STATE)
        setDetailError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [targetProviderId])

  if (mode === 'edit' && routeProviderId.length === 0) {
    return <Navigate replace to={buildAuthAdminProvidersPath()} />
  }

  const handleSelectProvider = (providerId: string) => {
    if (mode === 'create') {
      setSelectedProviderId(providerId)
      return
    }

    navigate(buildAuthAdminProviderEditPath(providerId))
  }

  const handleCopyCallbackUri = async () => {
    if (!selectedDetail?.callbackUri) {
      return
    }

    try {
      await navigator.clipboard.writeText(selectedDetail.callbackUri)
      setCopyFeedback('Callback copiato negli appunti.')
      setDetailError(null)
    } catch {
      setCopyFeedback(null)
      setDetailError('Impossibile copiare il callback. Copialo manualmente dal campo read-only.')
    }
  }

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!targetProviderId) {
      setDetailError('Seleziona prima un provider da configurare')
      return
    }

    setSaving(true)
    setCopyFeedback(null)

    try {
      await updateAuthAdminProvider(targetProviderId, toProviderInput(formState, selectedDetail))
      const providersPayload = await fetchAuthAdminProviders()
      setItems(providersPayload.items ?? [])
      setPageError(null)

      if (mode === 'create') {
        navigate(buildAuthAdminProviderEditPath(targetProviderId), { replace: true })
        return
      }

      const detailPayload = await fetchAuthAdminProvider(targetProviderId)
      setSelectedDetail(detailPayload.provider)
      setFormState(toFormState(detailPayload.provider))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Errore salvataggio provider ${targetProviderId}`
      setDetailError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-200 pb-4">
        <Link
          to={buildAuthAdminProvidersPath()}
          className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:text-sky-800"
        >
          Back to Providers
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">
          {mode === 'create' ? 'Configura provider' : 'Modifica provider'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {selectedDetail?.type === 'oidc'
            ? 'Il callback OIDC viene derivato automaticamente dal dominio corrente. Lascia vuoto il client secret per mantenere il valore attuale.'
            : 'Aggiorna label, ordine e stato pubblico del provider locale.'}
        </p>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      <form className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={(event) => void handleSave(event)}>
        {detailError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {detailError}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Provider
            <select
              value={targetProviderId}
              onChange={(event) => handleSelectProvider(event.target.value)}
              disabled={detailLoading || loading || selectableItems.length === 0}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
            >
              {selectableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Label
            <input
              type="text"
              value={formState.label}
              onChange={(event) => updateFormState(setFormState, { label: event.target.value })}
              disabled={detailLoading}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Ordine
            <input
              type="number"
              value={formState.sortOrder}
              onChange={(event) => updateFormState(setFormState, { sortOrder: event.target.value })}
              disabled={detailLoading}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={formState.enabled}
              onChange={(event) => updateFormState(setFormState, { enabled: event.target.checked })}
              disabled={detailLoading}
            />
            Provider pubblico
          </label>

          {selectedDetail?.type === 'oidc' ? (
            <>
              {selectedDetail.providerFamily === 'entra-id' ? (
                <label className="text-sm font-medium text-slate-700">
                  Tenant ID
                  <input
                    type="text"
                    value={formState.tenantId}
                    onChange={(event) =>
                      updateFormState(setFormState, { tenantId: event.target.value })
                    }
                    disabled={detailLoading}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
                  />
                </label>
              ) : null}

              {selectedDetail.providerFamily === 'auth0' ? (
                <label className="text-sm font-medium text-slate-700">
                  Domain
                  <input
                    type="text"
                    value={formState.domain}
                    onChange={(event) =>
                      updateFormState(setFormState, { domain: event.target.value })
                    }
                    disabled={detailLoading}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
                  />
                </label>
              ) : null}

              {selectedDetail.providerFamily === 'custom' ? (
                <label className="text-sm font-medium text-slate-700">
                  Issuer
                  <input
                    type="url"
                    value={formState.issuer}
                    onChange={(event) =>
                      updateFormState(setFormState, { issuer: event.target.value })
                    }
                    disabled={detailLoading}
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
                  />
                </label>
              ) : null}

              <label className="text-sm font-medium text-slate-700">
                Client ID
                <input
                  type="text"
                  value={formState.clientId}
                  onChange={(event) =>
                    updateFormState(setFormState, { clientId: event.target.value })
                  }
                  disabled={detailLoading}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Client Secret
                <input
                  type="password"
                  value={formState.clientSecret}
                  onChange={(event) =>
                    updateFormState(setFormState, { clientSecret: event.target.value })
                  }
                  disabled={detailLoading}
                  placeholder={
                    selectedDetail.hasClientSecret
                      ? 'Lascia vuoto per mantenere il secret attuale'
                      : 'Inserisci il client secret'
                  }
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
                />
              </label>

              <div className="text-sm font-medium text-slate-700 lg:col-span-2">
                Callback OIDC
                <div className="mt-2 flex flex-col gap-2 md:flex-row">
                  <input
                    type="text"
                    value={selectedDetail.callbackUri ?? ''}
                    readOnly
                    disabled={detailLoading}
                    className="block w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyCallbackUri()}
                    disabled={detailLoading || !selectedDetail.callbackUri}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Copia
                  </button>
                </div>
                <p className="mt-2 text-xs font-normal text-slate-500">
                  Registra questo URI nel provider esterno. Il valore viene calcolato dal dominio
                  pubblico da cui stai operando.
                </p>
                {copyFeedback ? (
                  <p className="mt-2 text-xs font-medium text-emerald-700">{copyFeedback}</p>
                ) : null}
              </div>

              <AuthProviderQuickSetupCard provider={selectedDetail} />

              {selectedDetail.providerFamily === 'custom' ? (
                <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                  Scopes
                  <input
                    type="text"
                    value={formState.scopesText}
                    onChange={(event) =>
                      updateFormState(setFormState, { scopesText: event.target.value })
                    }
                    disabled={detailLoading}
                    placeholder="openid, email, profile"
                    className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
                  />
                </label>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600 lg:col-span-2">
                  Scopes predefiniti: <span className="font-medium">openid email profile</span>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <Link
            to={buildAuthAdminProvidersPath()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={saving || detailLoading || !targetProviderId}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? 'Salvataggio...'
              : selectedDetail?.status === 'not_configured' || mode === 'create'
                ? 'Configura provider'
                : 'Salva modifiche'}
          </button>
        </div>
      </form>
    </section>
  )
}

function toFormState(provider: AuthAdminProviderDetailItem): ProviderFormState {
  return {
    label: provider.label,
    enabled: provider.enabled,
    sortOrder: String(provider.sortOrder),
    clientId: provider.clientId ?? '',
    clientSecret: '',
    tenantId: provider.tenantId ?? '',
    domain: provider.domain ?? '',
    issuer: provider.issuer ?? '',
    scopesText: (provider.scopes ?? ['openid', 'email', 'profile']).join(', '),
  }
}

function toProviderInput(
  formState: ProviderFormState,
  detail: AuthAdminProviderDetailItem | null,
): AuthAdminProviderInput {
  const basePayload: AuthAdminProviderInput = {
    label: formState.label.trim(),
    enabled: formState.enabled,
    sortOrder: Number.parseInt(formState.sortOrder || '0', 10) || 0,
  }

  if (!detail || detail.type !== 'oidc') {
    return basePayload
  }

  const payload: AuthAdminProviderInput = {
    ...basePayload,
    clientId: formState.clientId.trim(),
    clientSecret: formState.clientSecret.trim() || undefined,
  }

  if (detail.providerFamily === 'entra-id') {
    payload.tenantId = formState.tenantId.trim()
  }

  if (detail.providerFamily === 'auth0') {
    payload.domain = formState.domain.trim()
  }

  if (detail.providerFamily === 'custom') {
    payload.issuer = formState.issuer.trim()
    payload.scopes = formState.scopesText
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }

  return payload
}

function updateFormState(
  setFormState: Dispatch<SetStateAction<ProviderFormState>>,
  patch: Partial<ProviderFormState>,
) {
  setFormState((current) => ({
    ...current,
    ...patch,
  }))
}
