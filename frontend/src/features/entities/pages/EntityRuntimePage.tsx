import { Navigate, useParams } from 'react-router-dom'

import {
  findEntitiesInScopeByRecordId,
  getAppEntityBasePath,
  isSalesforceRecordId,
} from '../../apps/app-workspace-routing'
import { useAppWorkspace } from '../../apps/useAppWorkspace'
import { EntityPageFrame } from '../components/EntityPageFrame'
import { EntityStatePanel } from '../components/EntityStatePanel'
import { EntityListPage } from './EntityListPage'

export function EntityRuntimePage() {
  const { entityId = '' } = useParams()
  const { error, loading, selectedApp, selectedEntities } = useAppWorkspace()

  if (!isSalesforceRecordId(entityId)) {
    return <EntityListPage />
  }

  if (loading) {
    return (
      <EntityPageFrame title="Risoluzione record in corso" breadcrumbs={[{ label: 'Home', to: '/' }, { label: entityId }]}>
        <EntityStatePanel
          title="Verifica entity target in corso..."
          description="Sto risolvendo il record Salesforce nel contesto dell'app corrente."
        />
      </EntityPageFrame>
    )
  }

  const matches = findEntitiesInScopeByRecordId(selectedEntities, entityId)
  if (matches.length === 1) {
    return <Navigate replace to={`${getAppEntityBasePath(matches[0])}/${entityId}`} />
  }

  let description = "L'id Salesforce non corrisponde a una entity disponibile nell'app corrente."
  if (error) {
    description = `Workspace app non disponibile: ${error}`
  } else if (selectedEntities.length === 0) {
    description = "L'app corrente non espone entity runtime con cui risolvere questo record."
  } else if (matches.length > 1) {
    description = "Il record corrisponde a più entity dell'app corrente. Nessun redirect automatico eseguito."
  }

  return (
    <EntityPageFrame
      title="Record non risolvibile"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: selectedApp?.label ?? 'Workspace' }, { label: entityId }]}
    >
      <EntityStatePanel
        tone="error"
        title="Impossibile determinare l'entity target"
        description={description}
      />
    </EntityPageFrame>
  )
}
