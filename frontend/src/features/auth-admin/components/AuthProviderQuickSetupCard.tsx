import type { AuthAdminProviderDetailItem } from '../auth-admin-types'

type AuthProviderQuickSetupCardProps = {
  provider: AuthAdminProviderDetailItem
}

type QuickSetupGuide = {
  title: string
  summary: string
  steps: string[]
  fields: Array<{
    label: string
    value: string
  }>
}

export function AuthProviderQuickSetupCard({ provider }: AuthProviderQuickSetupCardProps) {
  if (provider.type !== 'oidc' || !provider.callbackUri) {
    return null
  }

  const guide = buildQuickSetupGuide(provider)

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 lg:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
        Quick setup
      </p>
      <h4 className="mt-1 text-base font-semibold text-slate-950">{guide.title}</h4>
      <p className="mt-1 text-sm text-slate-600">{guide.summary}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <p className="text-sm font-semibold text-slate-900">Step operativi</p>
          <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
            {guide.steps.map((step) => (
              <li key={step} className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2">
                {step}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-900">Valori da usare</p>
          <dl className="mt-2 space-y-2">
            {guide.fields.map((field) => (
              <div key={field.label} className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {field.label}
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-slate-700">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

function buildQuickSetupGuide(provider: AuthAdminProviderDetailItem): QuickSetupGuide {
  const publicOrigin = readPublicOrigin(provider.callbackUri)
  const commonFields = [
    {
      label: 'Origin pubblico',
      value: publicOrigin,
    },
    {
      label: 'Callback OIDC',
      value: provider.callbackUri ?? '',
    },
  ]

  if (provider.providerFamily === 'google') {
    return {
      title: 'Google Cloud Console',
      summary:
        'Configura un OAuth Client di tipo Web application e registra il callback derivato da questa istanza.',
      steps: [
        'Apri Google Cloud Console > APIs & Services > Credentials e crea o modifica un OAuth 2.0 Client ID di tipo Web application.',
        'In URI di reindirizzamento autorizzati aggiungi esattamente il valore Callback OIDC mostrato qui sotto.',
        'In Origini JavaScript autorizzate aggiungi l’Origin pubblico se vuoi usare lo stesso client anche per pagine servite da questo dominio.',
        'Salva in Google Cloud e copia Client ID e Client Secret nei campi di questo pannello.',
      ],
      fields: commonFields,
    }
  }

  if (provider.providerFamily === 'entra-id') {
    return {
      title: 'Microsoft Entra ID',
      summary:
        'Registra una Web app in App registrations e usa il tenant della directory come input del provider.',
      steps: [
        'Apri Microsoft Entra admin center > App registrations e crea o modifica l’applicazione.',
        'In Authentication aggiungi una piattaforma Web e inserisci il Callback OIDC come Redirect URI.',
        'In Certificates & secrets genera un nuovo client secret e riportalo nel campo Client Secret di questo pannello.',
        'Usa Application (client) ID come Client ID e Directory (tenant) ID come Tenant ID.',
      ],
      fields: commonFields,
    }
  }

  if (provider.providerFamily === 'auth0') {
    return {
      title: 'Auth0 Dashboard',
      summary:
        'Usa un’applicazione di tipo Regular Web Application e registra il callback per il dominio pubblico corrente.',
      steps: [
        'Apri Auth0 Dashboard > Applications > Applications e crea o modifica una Regular Web Application.',
        'In Allowed Callback URLs aggiungi esattamente il valore Callback OIDC mostrato qui sotto.',
        'Usa il dominio tenant completo nel campo Domain, ad esempio https://tenant.eu.auth0.com.',
        'Copia Client ID e Client Secret dall’applicazione Auth0 nei campi di questo pannello.',
      ],
      fields: commonFields,
    }
  }

  return {
    title: 'Provider OIDC custom',
    summary:
      'Usa queste indicazioni per provider compatibili OIDC che espongono discovery standard e callback configurabile.',
    steps: [
      'Crea o modifica un client OIDC lato provider e registra il Callback OIDC mostrato qui sotto tra i redirect/callback URL consentiti.',
      'Inserisci nel campo Issuer l’issuer base del provider; il sistema userà automaticamente la discovery standard su `/.well-known/openid-configuration`.',
      'Compila Client ID e Client Secret con i valori emessi dal provider esterno.',
      'Se il provider richiede scope diversi dai default openid email profile, personalizzali nel campo Scopes.',
    ],
    fields: commonFields,
  }
}

function readPublicOrigin(callbackUri?: string): string {
  if (!callbackUri) {
    return ''
  }

  try {
    return new URL(callbackUri).origin
  } catch {
    return callbackUri
  }
}
