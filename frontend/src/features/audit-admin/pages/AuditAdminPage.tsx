import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import {
  fetchApplicationAuditList,
  fetchSecurityAuditList,
  fetchVisibilityAuditList,
} from '../audit-admin-api'
import type {
  ApplicationAuditQuery,
  ApplicationAuditSummary,
  AuditStream,
  SecurityAuditQuery,
  SecurityAuditSummary,
  VisibilityAuditQuery,
  VisibilityAuditSummary,
} from '../audit-admin-types'
import {
  AUDIT_TAB_COPY,
  DEFAULT_AUDIT_LIMIT,
  buildAuditSearch,
  buildAuditViewPath,
  parseAuditFilters,
  parseAuditTab,
} from '../audit-admin-utils'

export function AuditAdminPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = parseAuditTab(searchParams.get('tab'))
  const [activeTab, setActiveTab] = useState<AuditStream>(initialTab)
  const [securityFilters, setSecurityFilters] = useState<SecurityAuditQuery>(() =>
    initialTab === 'security'
      ? (parseAuditFilters('security', searchParams) as SecurityAuditQuery)
      : { limit: DEFAULT_AUDIT_LIMIT },
  )
  const [visibilityFilters, setVisibilityFilters] = useState<VisibilityAuditQuery>(() =>
    initialTab === 'visibility'
      ? (parseAuditFilters('visibility', searchParams) as VisibilityAuditQuery)
      : { limit: DEFAULT_AUDIT_LIMIT },
  )
  const [applicationFilters, setApplicationFilters] = useState<ApplicationAuditQuery>({
    ...(initialTab === 'application'
      ? (parseAuditFilters('application', searchParams) as ApplicationAuditQuery)
      : {}),
    limit: DEFAULT_AUDIT_LIMIT,
  })
  const [items, setItems] = useState<
    SecurityAuditSummary[] | VisibilityAuditSummary[] | ApplicationAuditSummary[]
  >([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const activeFilters = useMemo(() => {
    if (activeTab === 'security') {
      return securityFilters
    }

    if (activeTab === 'visibility') {
      return visibilityFilters
    }

    return applicationFilters
  }, [activeTab, applicationFilters, securityFilters, visibilityFilters])

  useEffect(() => {
    const nextTab = parseAuditTab(searchParams.get('tab'))
    setActiveTab(nextTab)

    if (nextTab === 'security') {
      setSecurityFilters(parseAuditFilters('security', searchParams) as SecurityAuditQuery)
      return
    }

    if (nextTab === 'visibility') {
      setVisibilityFilters(parseAuditFilters('visibility', searchParams) as VisibilityAuditQuery)
      return
    }

    setApplicationFilters(parseAuditFilters('application', searchParams) as ApplicationAuditQuery)
  }, [searchParams])

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setPageError(null)

    const load = async () => {
      try {
        if (activeTab === 'security') {
          const payload = await fetchSecurityAuditList({ ...securityFilters, cursor: undefined })
          if (!cancelled) {
            setItems(payload.items)
            setNextCursor(payload.nextCursor)
          }
          return
        }

        if (activeTab === 'visibility') {
          const payload = await fetchVisibilityAuditList({
            ...visibilityFilters,
            cursor: undefined,
          })
          if (!cancelled) {
            setItems(payload.items)
            setNextCursor(payload.nextCursor)
          }
          return
        }

        const payload = await fetchApplicationAuditList({
          ...applicationFilters,
          cursor: undefined,
        })
        if (!cancelled) {
          setItems(payload.items)
          setNextCursor(payload.nextCursor)
        }
      } catch (error) {
        if (!cancelled) {
          setItems([])
          setNextCursor(null)
          setPageError(error instanceof Error ? error.message : 'Errore caricamento audit')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [activeTab, applicationFilters, securityFilters, visibilityFilters])

  function syncSearchParams(
    stream: AuditStream,
    filters: SecurityAuditQuery | VisibilityAuditQuery | ApplicationAuditQuery,
  ) {
    const query = buildAuditSearch(stream, filters)
    setSearchParams(new URLSearchParams(query.slice(1)))
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) {
      return
    }

    setLoadingMore(true)

    try {
      if (activeTab === 'security') {
        const payload = await fetchSecurityAuditList({
          ...securityFilters,
          cursor: nextCursor,
        })
        setItems((current) => [...current, ...payload.items] as typeof current)
        setNextCursor(payload.nextCursor)
      } else if (activeTab === 'visibility') {
        const payload = await fetchVisibilityAuditList({
          ...visibilityFilters,
          cursor: nextCursor,
        })
        setItems((current) => [...current, ...payload.items] as typeof current)
        setNextCursor(payload.nextCursor)
      } else {
        const payload = await fetchApplicationAuditList({
          ...applicationFilters,
          cursor: nextCursor,
        })
        setItems((current) => [...current, ...payload.items] as typeof current)
        setNextCursor(payload.nextCursor)
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Errore caricamento pagina successiva')
    } finally {
      setLoadingMore(false)
    }
  }

  function openDetail(id: string) {
    navigate({
      pathname: buildAuditViewPath(activeTab, id),
      search: location.search || buildAuditSearch(activeTab, activeFilters),
    })
  }

  function updateFilter(key: string, value: string) {
    if (activeTab === 'security') {
      const nextFilters = {
        ...securityFilters,
        [key]: value,
        cursor: undefined,
        limit: DEFAULT_AUDIT_LIMIT,
      }
      setSecurityFilters(nextFilters)
      syncSearchParams(activeTab, nextFilters)
      return
    }

    if (activeTab === 'visibility') {
      const nextFilters = {
        ...visibilityFilters,
        [key]: value,
        cursor: undefined,
        limit: DEFAULT_AUDIT_LIMIT,
      }
      setVisibilityFilters(nextFilters)
      syncSearchParams(activeTab, nextFilters)
      return
    }

    const nextFilters = {
      ...applicationFilters,
      [key]: value,
      cursor: undefined,
      limit: DEFAULT_AUDIT_LIMIT,
    }
    setApplicationFilters(nextFilters)
    syncSearchParams(activeTab, nextFilters)
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
          Admin
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Audit</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Lista read-only con tab separate per Security, Visibility e Application e pagina view
          dedicata per ogni evento.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-900">{AUDIT_TAB_COPY[activeTab].title}</p>
          <p className="mt-1 text-sm text-slate-600">{AUDIT_TAB_COPY[activeTab].description}</p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            From
            <input
              type="datetime-local"
              value={activeFilters.from ?? ''}
              onChange={(event) => updateFilter('from', event.target.value)}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            To
            <input
              type="datetime-local"
              value={activeFilters.to ?? ''}
              onChange={(event) => updateFilter('to', event.target.value)}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Contact Id
            <input
              type="text"
              value={activeFilters.contactId ?? ''}
              onChange={(event) => updateFilter('contactId', event.target.value)}
              placeholder="003..."
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Request Id
            <input
              type="text"
              value={activeFilters.requestId ?? ''}
              onChange={(event) => updateFilter('requestId', event.target.value)}
              placeholder="request-id"
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          {activeTab === 'security' ? (
            <>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Event Type
                <input
                  type="text"
                  value={securityFilters.eventType ?? ''}
                  onChange={(event) => updateFilter('eventType', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Decision
                <select
                  value={securityFilters.decision ?? ''}
                  onChange={(event) => updateFilter('decision', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Tutte</option>
                  <option value="ALLOW">ALLOW</option>
                  <option value="DENY">DENY</option>
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Reason Code
                <input
                  type="text"
                  value={securityFilters.reasonCode ?? ''}
                  onChange={(event) => updateFilter('reasonCode', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Endpoint
                <input
                  type="text"
                  value={securityFilters.endpoint ?? ''}
                  onChange={(event) => updateFilter('endpoint', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </>
          ) : null}
          {activeTab === 'visibility' ? (
            <>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Object API Name
                <input
                  type="text"
                  value={visibilityFilters.objectApiName ?? ''}
                  onChange={(event) => updateFilter('objectApiName', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Query Kind
                <input
                  type="text"
                  value={visibilityFilters.queryKind ?? ''}
                  onChange={(event) => updateFilter('queryKind', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Decision
                <select
                  value={visibilityFilters.decision ?? ''}
                  onChange={(event) => updateFilter('decision', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Tutte</option>
                  <option value="ALLOW">ALLOW</option>
                  <option value="DENY">DENY</option>
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Reason Code
                <input
                  type="text"
                  value={visibilityFilters.reasonCode ?? ''}
                  onChange={(event) => updateFilter('reasonCode', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </>
          ) : null}
          {activeTab === 'application' ? (
            <>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Action
                <input
                  type="text"
                  value={applicationFilters.action ?? ''}
                  onChange={(event) => updateFilter('action', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Status
                <select
                  value={applicationFilters.status ?? ''}
                  onChange={(event) => updateFilter('status', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Tutti</option>
                  <option value="PENDING">PENDING</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="FAILURE">FAILURE</option>
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Target Type
                <input
                  type="text"
                  value={applicationFilters.targetType ?? ''}
                  onChange={(event) => updateFilter('targetType', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Object API Name
                <input
                  type="text"
                  value={applicationFilters.objectApiName ?? ''}
                  onChange={(event) => updateFilter('objectApiName', event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {pageError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {pageError}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-600">Caricamento audit...</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {activeTab === 'security' ? (
                      <tr>
                        <th className="px-4 py-3 text-left">Created</th>
                        <th className="px-4 py-3 text-left">Event</th>
                        <th className="px-4 py-3 text-left">Decision</th>
                        <th className="px-4 py-3 text-left">Endpoint</th>
                        <th className="px-4 py-3 text-left">Request</th>
                        <th className="px-4 py-3 text-right">Azioni</th>
                      </tr>
                    ) : null}
                    {activeTab === 'visibility' ? (
                      <tr>
                        <th className="px-4 py-3 text-left">Created</th>
                        <th className="px-4 py-3 text-left">Object</th>
                        <th className="px-4 py-3 text-left">Query</th>
                        <th className="px-4 py-3 text-left">Decision</th>
                        <th className="px-4 py-3 text-left">Rows</th>
                        <th className="px-4 py-3 text-right">Azioni</th>
                      </tr>
                    ) : null}
                    {activeTab === 'application' ? (
                      <tr>
                        <th className="px-4 py-3 text-left">Created</th>
                        <th className="px-4 py-3 text-left">Action</th>
                        <th className="px-4 py-3 text-left">Target</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Contact</th>
                        <th className="px-4 py-3 text-right">Azioni</th>
                      </tr>
                    ) : null}
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-sm text-slate-500">
                          Nessun evento audit trovato con i filtri correnti.
                        </td>
                      </tr>
                    ) : null}
                    {activeTab === 'security'
                      ? (items as SecurityAuditSummary[]).map((item) => (
                          <tr key={item.id} className="bg-white">
                            <td className="px-4 py-3 text-slate-700">
                              {new Date(item.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div className="font-semibold text-slate-900">{item.eventType}</div>
                              <div className="text-xs text-slate-500">{item.reasonCode}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{item.decision}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {item.httpMethod} {item.endpoint}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{item.requestId}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => openDetail(item.id)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      : null}
                    {activeTab === 'visibility'
                      ? (items as VisibilityAuditSummary[]).map((item) => (
                          <tr key={item.id} className="bg-white">
                            <td className="px-4 py-3 text-slate-700">
                              {new Date(item.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {item.objectApiName}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{item.queryKind}</td>
                            <td className="px-4 py-3 text-slate-700">
                              <div>{item.decision}</div>
                              <div className="text-xs text-slate-500">{item.reasonCode}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{item.rowCount}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => openDetail(item.id)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      : null}
                    {activeTab === 'application'
                      ? (items as ApplicationAuditSummary[]).map((item) => (
                          <tr key={item.id} className="bg-white">
                            <td className="px-4 py-3 text-slate-700">
                              {new Date(item.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div className="font-semibold text-slate-900">{item.action}</div>
                              <div className="text-xs text-slate-500">
                                {item.objectApiName || '-'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div>{item.targetType}</div>
                              <div className="text-xs text-slate-500">{item.targetId}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div>{item.status}</div>
                              <div className="text-xs text-slate-500">{item.errorCode || '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{item.contactId}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => openDetail(item.id)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      : null}
                  </tbody>
                </table>
              </div>
            </div>

            {nextCursor ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? 'Caricamento...' : 'Carica altri'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
