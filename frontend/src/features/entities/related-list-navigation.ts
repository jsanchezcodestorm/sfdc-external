import {
  findEntityInScope,
  findEntitiesInScopeByObjectApiName,
  buildAppEntityBasePath,
  resolveScopedEntityBasePath,
} from '../apps/app-workspace-routing'
import type { AvailableAppEntityItem } from '../apps/app-types'

import type { RelatedListConfig } from './entity-types'

export type RelatedListNavigationTarget = {
  entityId: string | null
  baseEntityPath: string
  warning?: string
}

export function resolveRelatedListNavigationTarget(
  appId: string,
  relatedList: RelatedListConfig | undefined,
  scopedEntities: AvailableAppEntityItem[],
): RelatedListNavigationTarget {
  const explicitEntityId = relatedList?.entityId?.trim() ?? ''
  if (explicitEntityId) {
    const scopedEntity = findEntityInScope(scopedEntities, explicitEntityId)

    return {
      entityId: explicitEntityId,
      baseEntityPath: scopedEntity
        ? buildAppEntityBasePath(appId, scopedEntity.entityId)
        : resolveScopedEntityBasePath(appId, explicitEntityId, scopedEntities),
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
      entityId: matches[0].entityId,
      baseEntityPath: buildAppEntityBasePath(appId, matches[0].entityId),
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
