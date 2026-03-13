import type { EntityConfig } from '../entities/entity-types'
import type { AclResourceStatus } from '../../lib/acl-resource-status'

export type EntityAdminConfigSummary = {
  id: string
  label: string
  objectApiName: string
  aclResourceStatus: AclResourceStatus
  hasList: boolean
  hasDetail: boolean
  hasForm: boolean
  layoutCount: number
  detailLayoutCount: number
  formLayoutCount: number
  assignmentCount: number
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
  aclResourceStatus: AclResourceStatus
}

export type EntityAdminBootstrapPreviewResponse = {
  entity: EntityConfig
  warnings: string[]
}

export type SalesforceObjectApiNameSuggestion = {
  name: string
  label: string
  custom: boolean
}

export type SalesforceObjectApiNameSuggestionResponse = {
  items: SalesforceObjectApiNameSuggestion[]
}

export type SalesforceObjectFieldSuggestion = {
  name: string
  label: string
  type: string
  filterable: boolean
}

export type SalesforceObjectFieldSuggestionResponse = {
  items: SalesforceObjectFieldSuggestion[]
}

export type SalesforceRecordTypeSuggestion = {
  developerName: string
  label: string
  active: boolean
  available: boolean
  defaultRecordTypeMapping: boolean
  master: boolean
}

export type SalesforceRecordTypeSuggestionResponse = {
  items: SalesforceRecordTypeSuggestion[]
}

export type EntityConfigSectionKey =
  | 'object'
  | 'fields'
  | 'access'
  | 'record-types'
  | 'layouts'
  | 'preview'
  | 'detail'
  | 'form'
  | 'assignments'
