import { Link, useParams } from 'react-router-dom'

import { toTitleCase } from '../entity-helpers'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityStatePanel } from '../components/EntityStatePanel'
import { buildAppEntityBasePath, buildAppHomePath } from '../../apps/app-workspace-routing'

export function EntityRouteFallbackPage() {
  const { appId = '', entityId = '' } = useParams()
  const label = entityId ? toTitleCase(entityId) : 'Entity'
  const baseEntityPath = appId && entityId ? buildAppEntityBasePath(appId, entityId) : undefined

  return (
    <EntityPageFrame
      title="Sub path non disponibile"
      breadcrumbs={[
        { label: 'Launcher', to: '/' },
        { label: 'App', to: appId ? buildAppHomePath(appId) : undefined },
        { label, to: baseEntityPath },
      ]}
      actions={
        baseEntityPath ? (
          <Link
            to={baseEntityPath}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Torna alla list
          </Link>
        ) : undefined
      }
    >
      <EntityStatePanel
        tone="error"
        title="Percorso non riconosciuto"
        description="Controlla l URL o apri la list view dell entita."
      />
    </EntityPageFrame>
  )
}
