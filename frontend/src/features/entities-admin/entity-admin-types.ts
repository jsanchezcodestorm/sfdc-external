import type { EntityConfig } from '../entities/entity-types'

export type EntityAdminConfigSummary = {
  id: string
  label: string
  objectApiName: string
  hasList: boolean
  hasDetail: boolean
  hasForm: boolean
  viewCount: number
  detailSectionCount: number
  relatedListCount: number
  formSectionCount: number
  updatedAt: string
}

export type EntityAdminConfigListResponse = {
  items: EntityAdminConfigSummary[]
}

export type EntityAdminConfigResponse = {
  entity: EntityConfig
}

export type SalesforceObjectApiNameSuggestion = {
  name: string
  label: string
  custom: boolean
}

export type SalesforceObjectApiNameSuggestionResponse = {
  items: SalesforceObjectApiNameSuggestion[]
}

export type EntityConfigSectionKey = 'base' | 'list' | 'detail' | 'form'
