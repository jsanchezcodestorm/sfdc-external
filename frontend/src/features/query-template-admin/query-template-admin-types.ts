export type QueryTemplate = {
  id: string
  objectApiName: string
  description?: string
  soql: string
  defaultParams?: Record<string, string | number | boolean>
  maxLimit?: number
}

export type QueryTemplateAdminSummary = {
  id: string
  objectApiName: string
  description?: string
  updatedAt: string
  aclResourceConfigured: boolean
}

export type QueryTemplateAdminListResponse = {
  items: QueryTemplateAdminSummary[]
}

export type QueryTemplateAdminResponse = {
  template: QueryTemplate
  aclResourceConfigured: boolean
}
