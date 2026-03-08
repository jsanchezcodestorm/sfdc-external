import {
  findEntitiesInScopeByObjectApiName,
  findEntityInScope,
  getAppEntityBasePath,
  resolveScopedEntityBasePath,
} from '../apps/app-workspace-routing'
import type { AvailableAppEntity } from '../apps/app-types'

import type { RelatedListConfig } from './entity-types'

export type RelatedListNavigationTarget = {
  entityId: string | null
  baseEntityPath: string
  warning?: string
}

export function resolveRelatedListNavigationTarget(
  relatedList: RelatedListConfig | undefined,
  scopedEntities: AvailableAppEntity[],
): RelatedListNavigationTarget {
  const explicitEntityId = relatedList?.entityId?.trim() ?? ''
  if (explicitEntityId) {
    const scopedEntity = findEntityInScope(scopedEntities, explicitEntityId)

    return {
      entityId: explicitEntityId,
      baseEntityPath: scopedEntity
        ? getAppEntityBasePath(scopedEntity)
        : resolveScopedEntityBasePath(explicitEntityId, scopedEntities),
    }
  }

  const objectApiName = relatedList?.query?.object?.trim() ?? ''
  if (!objectApiName) {
    return {
      entityId: null,
      baseEntityPath: '',
      warning: 'Link dettaglio disabilitati: related list senza objectApiName target.',
    }
  }

  const matches = findEntitiesInScopeByObjectApiName(scopedEntities, objectApiName)
  if (matches.length === 1) {
    return {
      entityId: matches[0].id,
      baseEntityPath: getAppEntityBasePath(matches[0]),
    }
  }

  if (matches.length === 0) {
    return {
      entityId: null,
      baseEntityPath: '',
      warning: `Link dettaglio disabilitati: nessuna entity dell'app corrente mappa ${objectApiName}.`,
    }
  }

  return {
    entityId: null,
    baseEntityPath: '',
    warning: `Link dettaglio disabilitati: più entity dell'app corrente mappano ${objectApiName}.`,
  }
}
