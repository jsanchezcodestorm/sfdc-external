import { Link } from 'react-router-dom'

import {
  getAllowedRouteDestinations,
  getRouteDefinition,
  isKnownRouteId,
} from '../route-access-registry'
import { useRouteAccess } from '../useRouteAccess'

type RouteAccessDeniedPageProps = {
  requestedRouteId?: string
  title?: string
  description?: string
}

export function RouteAccessDeniedPage({
  requestedRouteId,
  title = 'Accesso negato',
  description,
}: RouteAccessDeniedPageProps) {
  const { allowedRouteIds, error } = useRouteAccess()
  const requestedRoute =
    requestedRouteId && isKnownRouteId(requestedRouteId)
      ? getRouteDefinition(requestedRouteId)
      : null
  const allowedDestinations = getAllowedRouteDestinations(allowedRouteIds).filter(
    (route) => route.id !== requestedRoute?.id,
  )

  const resolvedDescription =
    description ??
    (error
      ? 'Non e stato possibile verificare le route consentite. L accesso resta bloccato per sicurezza.'
      : requestedRoute
      ? `La route ${requestedRoute.label} non e disponibile per la sessione corrente.`
      : 'La sessione e valida, ma non risultano route consentite per questa area.')

  return (
    <section className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl items-center justify-center px-4 py-10">
      <div className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
          Route ACL
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-amber-950/90">{resolvedDescription}</p>

        {error ? (
          <p className="mt-3 rounded-2xl border border-amber-300/70 bg-white/60 px-4 py-3 text-sm text-amber-900">
            Dettaglio verifica: {error}
          </p>
        ) : null}

        {allowedDestinations.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm font-semibold text-slate-900">Route disponibili</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {allowedDestinations.map((route) => (
                <Link
                  key={route.id}
                  to={route.path}
                  className="rounded-2xl border border-amber-300 bg-white/80 px-4 py-3 text-left transition hover:bg-white"
                >
                  <span className="block text-sm font-semibold text-slate-950">
                    {route.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    {route.description}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm text-amber-950/90">
            Nessuna route alternativa e disponibile per la sessione corrente.
          </p>
        )}
      </div>
    </section>
  )
}
