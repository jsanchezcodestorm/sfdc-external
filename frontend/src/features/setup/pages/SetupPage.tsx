import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import {
  completeInitialSetup,
  testSalesforceSetup,
} from '../setup-api'
import { SetupStatusScreen } from '../components/SetupStatusScreen'
import type {
  CompleteSetupRequest,
  SetupSalesforceConfig,
  SetupSalesforceTestResponse,
} from '../setup-types'
import { useSetup } from '../useSetup'

type WizardStep = 1 | 2 | 3
type SalesforceMode = SetupSalesforceConfig['mode']

type SalesforceDraftState = {
  mode: SalesforceMode
  loginUrl: string
  username: string
  password: string
  securityToken: string
  instanceUrl: string
  accessToken: string
}

function createInitialSalesforceDraft(): SalesforceDraftState {
  return {
    mode: 'username-password',
    loginUrl: 'https://login.salesforce.com',
    username: '',
    password: '',
    securityToken: '',
    instanceUrl: '',
    accessToken: '',
  }
}

function buildSalesforcePayload(value: SalesforceDraftState): SetupSalesforceConfig {
  if (value.mode === 'access-token') {
    return {
      mode: 'access-token',
      instanceUrl: value.instanceUrl.trim(),
      accessToken: value.accessToken.trim(),
    }
  }

  return {
    mode: 'username-password',
    loginUrl: value.loginUrl.trim(),
    username: value.username.trim(),
    password: value.password,
    securityToken: value.securityToken.trim() || undefined,
  }
}

function isStepOneComplete(
  siteName: string,
  adminEmail: string,
  bootstrapPassword: string,
  confirmBootstrapPassword: string,
): boolean {
  return (
    siteName.trim().length > 0 &&
    adminEmail.trim().length > 0 &&
    bootstrapPassword.trim().length > 0 &&
    bootstrapPassword === confirmBootstrapPassword
  )
}

type StepButtonProps = {
  isActive: boolean
  isCompleted: boolean
  label: string
  title: string
}

function StepButton({ isActive, isCompleted, label, title }: StepButtonProps) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        isActive
          ? 'border-sky-300 bg-sky-50 text-sky-900'
          : isCompleted
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
    </div>
  )
}

export function SetupPage() {
  const navigate = useNavigate()
  const { brandName, error, isLoading, refreshStatus, status } = useSetup()
  const [step, setStep] = useState<WizardStep>(1)
  const [siteName, setSiteName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [bootstrapPassword, setBootstrapPassword] = useState('')
  const [confirmBootstrapPassword, setConfirmBootstrapPassword] = useState('')
  const [salesforce, setSalesforce] = useState<SalesforceDraftState>(
    createInitialSalesforceDraft,
  )
  const [testResult, setTestResult] = useState<SetupSalesforceTestResponse | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const salesforcePayload = useMemo(() => buildSalesforcePayload(salesforce), [salesforce])
  const salesforceFingerprint = useMemo(
    () => JSON.stringify(salesforcePayload),
    [salesforcePayload],
  )
  const [lastSuccessfulTestFingerprint, setLastSuccessfulTestFingerprint] =
    useState<string | null>(null)

  if (isLoading) {
    return (
      <SetupStatusScreen
        eyebrow="Initial Setup"
        title="Verifica setup in corso"
        description="Raccolgo lo stato attuale dell’installazione prima di mostrare la wizard."
      />
    )
  }

  if (error) {
    return (
      <SetupStatusScreen
        eyebrow="Initial Setup"
        title="Impossibile caricare la wizard"
        description={error}
        tone="danger"
      />
    )
  }

  if (status?.state === 'completed') {
    return <Navigate replace to="/login" />
  }

  const isSalesforceTestCurrent =
    Boolean(testResult) && lastSuccessfulTestFingerprint === salesforceFingerprint

  const handleSalesforceModeChange = (mode: SalesforceMode) => {
    setSalesforce((current) => ({
      ...current,
      mode,
    }))
    setTestResult(null)
    setTestError(null)
    setSubmitError(null)
    setLastSuccessfulTestFingerprint(null)
  }

  const handleSalesforceFieldChange = (
    field: keyof Omit<SalesforceDraftState, 'mode'>,
    value: string,
  ) => {
    setSalesforce((current) => ({
      ...current,
      [field]: value,
    }))
    setTestResult(null)
    setTestError(null)
    setSubmitError(null)
    setLastSuccessfulTestFingerprint(null)
  }

  const handleTestSalesforce = async () => {
    setIsTesting(true)
    setTestError(null)
    setSubmitError(null)

    try {
      const response = await testSalesforceSetup(salesforcePayload)
      setTestResult(response)
      setLastSuccessfulTestFingerprint(salesforceFingerprint)
      setStep(3)
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Test connessione Salesforce non riuscito.'
      setTestResult(null)
      setTestError(message)
    } finally {
      setIsTesting(false)
    }
  }

  const handleCompleteSetup = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const payload: CompleteSetupRequest = {
        siteName: siteName.trim(),
        adminEmail: adminEmail.trim(),
        bootstrapPassword,
        salesforce: salesforcePayload,
      }

      await completeInitialSetup(payload)
      await refreshStatus()
      navigate(`/login?username=${encodeURIComponent(adminEmail.trim())}`, {
        replace: true,
      })
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Completamento setup non riuscito.'
      setSubmitError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#cffafe_0%,_#f8fafc_48%,_#ffffff_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-3xl border border-sky-100 bg-white/90 p-8 shadow-[0_26px_60px_-34px_rgba(2,132,199,0.55)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
            {brandName}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Wizard di prima configurazione
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Completa branding iniziale, bootstrap admin e connessione Salesforce. Finché il setup
            non viene chiuso, l’app resta instradata su questa wizard.
          </p>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <StepButton
            isActive={step === 1}
            isCompleted={isStepOneComplete(
              siteName,
              adminEmail,
              bootstrapPassword,
              confirmBootstrapPassword,
            )}
            label="Step 1"
            title="Branding e admin"
          />
          <StepButton
            isActive={step === 2}
            isCompleted={isSalesforceTestCurrent}
            label="Step 2"
            title="Connessione Salesforce"
          />
          <StepButton
            isActive={step === 3}
            isCompleted={false}
            label="Step 3"
            title="Review e chiusura"
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/92 p-6 shadow-sm">
          {step === 1 ? (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Step 1
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Identità base dell’istanza
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Il nome sito viene usato nel branding UI. L’email admin bootstrap diventa il
                  primo account `PORTAL_ADMIN` e definisce qui la password iniziale locale.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-800">Nome sito</span>
                  <input
                    value={siteName}
                    onChange={(event) => setSiteName(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Acme Operations Portal"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-800">Email admin</span>
                  <input
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="admin@example.com"
                    type="email"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-800">
                    Password iniziale admin
                  </span>
                  <input
                    value={bootstrapPassword}
                    onChange={(event) => setBootstrapPassword(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Inserisci la password iniziale"
                    type="password"
                    autoComplete="new-password"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-slate-800">
                    Conferma password
                  </span>
                  <input
                    value={confirmBootstrapPassword}
                    onChange={(event) => setConfirmBootstrapPassword(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Ripeti la password iniziale"
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
              </div>

              {confirmBootstrapPassword.length > 0 &&
              confirmBootstrapPassword !== bootstrapPassword ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Le password non coincidono.
                </p>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={
                    !isStepOneComplete(
                      siteName,
                      adminEmail,
                      bootstrapPassword,
                      confirmBootstrapPassword,
                    )
                  }
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Continua
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Step 2
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    Configurazione Salesforce
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Scegli il metodo di autenticazione che userà il backend runtime. I segreti
                    vengono cifrati prima di essere salvati su PostgreSQL.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Torna indietro
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleSalesforceModeChange('username-password')}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    salesforce.mode === 'username-password'
                      ? 'border-sky-300 bg-sky-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-950">Username + Password</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Login con credenziali di integrazione e security token opzionale.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSalesforceModeChange('access-token')}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    salesforce.mode === 'access-token'
                      ? 'border-sky-300 bg-sky-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-950">Access Token</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Runtime già autorizzato con token e instance URL esplicito.
                  </p>
                </button>
              </div>

              {salesforce.mode === 'username-password' ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-slate-800">Login URL</span>
                    <input
                      value={salesforce.loginUrl}
                      onChange={(event) =>
                        handleSalesforceFieldChange('loginUrl', event.target.value)
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-800">Username</span>
                    <input
                      value={salesforce.username}
                      onChange={(event) =>
                        handleSalesforceFieldChange('username', event.target.value)
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-800">Password</span>
                    <input
                      value={salesforce.password}
                      onChange={(event) =>
                        handleSalesforceFieldChange('password', event.target.value)
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      type="password"
                    />
                  </label>

                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-slate-800">
                      Security Token
                    </span>
                    <input
                      value={salesforce.securityToken}
                      onChange={(event) =>
                        handleSalesforceFieldChange('securityToken', event.target.value)
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      type="password"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-slate-800">Instance URL</span>
                    <input
                      value={salesforce.instanceUrl}
                      onChange={(event) =>
                        handleSalesforceFieldChange('instanceUrl', event.target.value)
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                      placeholder="https://your-instance.my.salesforce.com"
                    />
                  </label>

                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-slate-800">Access Token</span>
                    <textarea
                      value={salesforce.accessToken}
                      onChange={(event) =>
                        handleSalesforceFieldChange('accessToken', event.target.value)
                      }
                      className="min-h-36 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />
                  </label>
                </div>
              )}

              {testError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {testError}
                </p>
              ) : null}

              {isSalesforceTestCurrent && testResult ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
                  <p className="font-semibold">Connessione verificata</p>
                  <p className="mt-2">
                    Org: {testResult.organizationId ?? 'n/d'} · URL:{' '}
                    {testResult.instanceUrl ?? 'n/d'}
                  </p>
                  {testResult.username ? <p className="mt-1">Utente: {testResult.username}</p> : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleTestSalesforce}
                  disabled={isTesting}
                  className="rounded-2xl border border-sky-300 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isTesting ? 'Test in corso...' : 'Testa connessione'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!isSalesforceTestCurrent}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Vai alla review
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Step 3
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                    Review finale
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Verifica il riepilogo e completa il bootstrap. Dopo il salvataggio la wizard
                    viene bloccata e l’istanza passa al login applicativo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Modifica Salesforce
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Istanza
                  </p>
                  <p className="mt-3 text-lg font-semibold text-slate-950">{siteName.trim()}</p>
                  <p className="mt-2 text-sm text-slate-600">Admin bootstrap: {adminEmail.trim()}</p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Auth applicativa
                  </p>
                  <p className="mt-3 text-lg font-semibold text-slate-950">
                    Credenziale locale bootstrap
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Primo login: {adminEmail.trim()} con password definita nello step 1. I provider
                    OIDC restano opzionali e configurabili successivamente.
                  </p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Salesforce
                  </p>
                  <p className="mt-3 text-lg font-semibold text-slate-950">
                    {salesforce.mode === 'access-token'
                      ? 'Access token runtime'
                      : 'Username + password runtime'}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Endpoint:{' '}
                    {salesforce.mode === 'access-token'
                      ? salesforce.instanceUrl.trim()
                      : salesforce.loginUrl.trim()}
                  </p>
                  {!isSalesforceTestCurrent ? (
                    <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      La configurazione Salesforce è cambiata dopo l’ultimo test. Riesegui la
                      verifica prima di completare.
                    </p>
                  ) : null}
                </article>
              </div>

              {submitError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {submitError}
                </p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Torna al test
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleCompleteSetup()
                  }}
                  disabled={isSubmitting || !isSalesforceTestCurrent}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSubmitting ? 'Salvataggio in corso...' : 'Completa setup'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
