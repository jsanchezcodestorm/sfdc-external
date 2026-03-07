import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { fetchAclPermissions } from '../../acl-admin/acl-admin-api'
import { SalesforceFieldMultiSelect } from '../../entities-admin/components/SalesforceFieldMultiSelect'
import { ObjectApiNameQuickFind } from '../../entities-admin/components/detail-form/ObjectApiNameQuickFind'
import {
  createVisibilityRule,
  fetchVisibilityCones,
  fetchVisibilityRule,
  updateVisibilityRule,
} from '../visibility-admin-api'
import { DetailBlock } from '../components/VisibilityAdminPrimitives'
import { VisibilityRuleBuilder } from '../components/VisibilityRuleBuilder'
import type {
  VisibilityConeSummary,
  VisibilityRule,
} from '../visibility-admin-types'
import {
  buildVisibilityConeViewPath,
  buildVisibilityRuleViewPath,
  buildVisibilityRulesListPath,
  createEmptyVisibilityRuleDraft,
  createVisibilityRuleDraft,
  parseVisibilityRuleDraft,
  type VisibilityRuleDraft,
} from '../visibility-admin-utils'

type VisibilityRuleEditorPageProps = {
  mode: 'create' | 'edit'
}

type RouteParams = {
  ruleId?: string
}

export function VisibilityRuleEditorPage({ mode }: VisibilityRuleEditorPageProps) {
  const navigate = useNavigate()
  const params = useParams<RouteParams>()
  const [searchParams] = useSearchParams()
  const previousRuleId = params.ruleId ? decodeURIComponent(params.ruleId) : null
  const prefilledConeId = searchParams.get('coneId')?.trim() ?? ''
  const [draft, setDraft] = useState<VisibilityRuleDraft>(createEmptyVisibilityRuleDraft())
  const [cones, setCones] = useState<VisibilityConeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [permissionCodes, setPermissionCodes] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const loadPromise =
      mode === 'edit' && previousRuleId
        ? Promise.all([
            fetchVisibilityCones(),
            fetchVisibilityRule(previousRuleId),
            fetchAclPermissions(),
          ])
        : Promise.all([fetchVisibilityCones(), Promise.resolve(null), fetchAclPermissions()])

    void loadPromise
      .then(([conesPayload, rulePayload, permissionsPayload]) => {
        if (cancelled) {
          return
        }

        const coneItems = conesPayload.items ?? []
        const nextPrefilledConeId = coneItems.some((cone) => cone.id === prefilledConeId)
          ? prefilledConeId
          : ''

        setCones(coneItems)
        setPermissionCodes((permissionsPayload.items ?? []).map((entry) => entry.code))

        if (mode === 'edit' && rulePayload) {
          setDraft(createVisibilityRuleDraft(rulePayload.rule))
        } else {
          setDraft(createEmptyVisibilityRuleDraft(nextPrefilledConeId))
        }

        setPageError(null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Errore caricamento visibility rule'
        setPageError(message)
        setCones([])
        setPermissionCodes([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mode, prefilledConeId, previousRuleId])

  const selectedCone = useMemo(
    () => cones.find((cone) => cone.id === draft.coneId) ?? null,
    [cones, draft.coneId],
  )

  const saveRule = async () => {
    let parsedRule: Omit<VisibilityRule, 'id'>

    try {
      parsedRule = parseVisibilityRuleDraft(draft)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rule non valida'
      setPageError(message)
      return
    }

    setSaving(true)
    setPageError(null)

    try {
      const payload =
        mode === 'create'
          ? await createVisibilityRule(parsedRule)
          : await updateVisibilityRule(previousRuleId ?? '', parsedRule)

      navigate(buildVisibilityRuleViewPath(payload.rule.id), { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore salvataggio visibility rule'
      setPageError(message)
    } finally {
      setSaving(false)
    }
  }

  const cancelTarget =
    mode === 'create'
      ? buildVisibilityRulesListPath()
      : buildVisibilityRuleViewPath(previousRuleId ?? '')

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {mode === 'create' ? 'Create' : 'Edit'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {mode === 'create' ? 'Nuova visibility rule' : draft.objectApiName || 'Visibility rule'}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(buildVisibilityRulesListPath())}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Lista rules
          </button>
          {selectedCone ? (
            <button
              type="button"
              onClick={() => navigate(buildVisibilityConeViewPath(selectedCone.id))}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-medium text-sky-800 transition hover:border-sky-400 hover:bg-sky-50"
            >
              Apri cone
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate(cancelTarget)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => {
              void saveRule()
            }}
            disabled={loading || saving || cones.length === 0 || !draft.coneId.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Salvataggio...' : 'Salva rule'}
          </button>
        </div>
      </div>

      {pageError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {pageError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Caricamento visibility rule...</p>
      ) : (
        <div className="mt-5 space-y-5">
          {cones.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Serve almeno un cone prima di creare o modificare una rule.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              <span className="flex items-center justify-between gap-3">
                <span>Cone</span>
                {selectedCone ? (
                  <button
                    type="button"
                    onClick={() => navigate(buildVisibilityConeViewPath(selectedCone.id))}
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-sky-700 transition hover:text-sky-900"
                  >
                    Apri cone
                  </button>
                ) : null}
              </span>
              <select
                value={draft.coneId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    coneId: event.target.value,
                  }))
                }
                disabled={cones.length === 0}
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  {cones.length === 0 ? 'Nessun cone disponibile' : 'Seleziona un cone'}
                </option>
                {cones.map((cone) => (
                  <option key={cone.id} value={cone.id}>
                    {cone.code}
                  </option>
                ))}
              </select>
              {selectedCone?.name ? (
                <p className="mt-2 text-xs font-normal text-slate-500">{selectedCone.name}</p>
              ) : null}
            </label>

            <label className="text-sm font-medium text-slate-700">
              Object API Name
              <ObjectApiNameQuickFind
                value={draft.objectApiName}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    objectApiName: value,
                  }))
                }
                placeholder="Account"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Effect
              <select
                value={draft.effect}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    effect: event.target.value as VisibilityRule['effect'],
                  }))
                }
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-sky-500"
              />
              Rule attiva
            </label>
          </div>

          <DetailBlock label="Condition Builder">
            <VisibilityRuleBuilder
              node={draft.condition}
              objectApiName={draft.objectApiName}
              onChange={(condition) =>
                setDraft((current) => ({
                  ...current,
                  condition,
                }))
              }
            />
          </DetailBlock>

          <div className="grid gap-5 lg:grid-cols-2">
            <SalesforceFieldMultiSelect
              label="Fields Allowed"
              objectApiName={draft.objectApiName}
              value={draft.fieldsAllowed}
              helperText="Whitelist dei campi visibili dopo il match delle regole ALLOW."
              onChange={(fieldsAllowed) =>
                setDraft((current) => ({
                  ...current,
                  fieldsAllowed,
                }))
              }
            />

            <SalesforceFieldMultiSelect
              label="Fields Denied"
              objectApiName={draft.objectApiName}
              value={draft.fieldsDenied}
              helperText="I campi negati hanno precedenza sul set finale visibility."
              onChange={(fieldsDenied) =>
                setDraft((current) => ({
                  ...current,
                  fieldsDenied,
                }))
              }
            />
          </div>

          {permissionCodes.length > 0 ? (
            <p className="text-xs text-slate-500">
              Catalogo ACL disponibile: {permissionCodes.length} permission code. Gli assignment
              usano i permission code come selettori indipendenti dal cone.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
