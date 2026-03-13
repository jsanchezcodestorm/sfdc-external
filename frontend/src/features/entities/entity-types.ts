export type EntityRecord = Record<string, unknown>

export type EntityColumn = {
  field: string
  label?: string
}

export type EntityActionType = 'edit' | 'delete' | 'link'

export type EntityAction = {
  type: EntityActionType
  label?: string
  target?: string
  entityId?: string
}

export type EntityQueryWhereObject = {
  raw?: string
  field?: string
  operator?: string
  value?: string | number | boolean | null | Array<string | number | boolean | null>
}

export type EntityQueryWhere = string | EntityQueryWhereObject

export type EntityQueryOrderBy = {
  field: string
  direction?: 'ASC' | 'DESC' | 'asc' | 'desc'
}

export type EntityQueryConfig = {
  object: string
  fields?: string[]
  where?: EntityQueryWhere[]
  orderBy?: EntityQueryOrderBy[]
  limit?: number
}

export type EntityListSearchConfig = {
  fields?: string[]
  minLength?: number
}

export type EntityListViewConfig = {
  id: string
  label: string
  description?: string
  default?: boolean
  pageSize?: number
  query?: EntityQueryConfig
  columns: Array<EntityColumn | string>
  search?: EntityListSearchConfig
  primaryAction?: EntityAction
  rowActions?: EntityAction[]
}

export type EntityListConfig = {
  title?: string
  subtitle?: string
  primaryAction?: EntityAction
  views?: EntityListViewConfig[]
}

export type RelatedListConfig = {
  id: string
  label: string
  description?: string
  entityId?: string
  query?: EntityQueryConfig
  columns?: Array<EntityColumn | string>
  actions?: EntityAction[]
  rowActions?: EntityAction[]
  emptyState?: string
  pageSize?: number
}

export type DetailFieldConfig = {
  label?: string
  field?: string
  template?: string
  highlight?: boolean
  format?: 'date' | 'datetime'
}

export type DetailSectionConfig = {
  title: string
  fields: DetailFieldConfig[]
}

export type PathStatusStepConfig = {
  value: string
  label?: string
}

export type PathStatusConfig = {
  field: string
  steps: PathStatusStepConfig[]
  allowUpdate?: boolean
}

export type LookupCondition = {
  field?: string
  operator?: string
  value?: string | number | boolean | null
  parentRel?: string
}

export type LookupOrderBy = {
  field: string
  direction?: 'asc' | 'desc' | 'ASC' | 'DESC'
}

export type LookupConfig = {
  searchField?: string
  where?: LookupCondition[]
  orderBy?: LookupOrderBy[]
  prefill?: boolean
}

export type FormFieldConfig = {
  field: string
  placeholder?: string
  lookup?: LookupConfig
}

export type FormSectionConfig = {
  title: string
  fields: FormFieldConfig[]
}

export type RuntimeFormInputType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'lookup'

export type RuntimeLookupConfig = LookupConfig & {
  referenceTo: string[]
  searchField: string
}

export type RuntimeFormFieldOption = {
  value: string
  label: string
  default?: boolean
}

export type RuntimeFormFieldConfig = {
  field: string
  label: string
  inputType: RuntimeFormInputType
  required: boolean
  placeholder?: string
  options?: RuntimeFormFieldOption[]
  lookup?: RuntimeLookupConfig
}

export type RuntimeFormSectionConfig = {
  title: string
  fields: RuntimeFormFieldConfig[]
}

export type EntityFieldDefinition = {
  field: string
  label: string
  type: string
  nillable: boolean
  createable?: boolean
  updateable?: boolean
  filterable?: boolean
  inputType?: RuntimeFormInputType
  required?: boolean
  options?: RuntimeFormFieldOption[]
  lookup?: RuntimeLookupConfig
}

export type EntityConfig = {
  id: string
  label?: string
  description?: string
  objectApiName?: string
  navigation?: {
    basePath?: string
  }
  list?: EntityListConfig
  detail?: {
    query?: EntityQueryConfig
    sections?: DetailSectionConfig[]
    relatedLists?: RelatedListConfig[]
    titleTemplate?: string
    fallbackTitle?: string
    subtitle?: string
    actions?: EntityAction[]
    pathStatus?: PathStatusConfig
  }
  form?: {
    title?: {
      create?: string
      edit?: string
    }
    query?: EntityQueryConfig
    subtitle?: string
    sections?: FormSectionConfig[]
  }
}

export type EntityConfigEnvelope = {
  entity: EntityConfig
  visibility?: unknown
}

export type EntityListResponse = {
  title?: string
  subtitle?: string
  columns?: Array<EntityColumn | string>
  records?: EntityRecord[]
  items?: EntityRecord[]
  data?: EntityRecord[]
  total?: number
  pageSize?: number
  nextCursor?: string | null
  viewId?: string
  primaryAction?: EntityAction
  rowActions?: EntityAction[]
}

export type EntityDetailResponse = {
  title?: string
  subtitle?: string
  sections?: DetailSectionConfig[]
  fieldDefinitions?: EntityFieldDefinition[]
  record?: EntityRecord
  data?: EntityRecord
  relatedLists?: RelatedListConfig[]
  actions?: EntityAction[]
  pathStatus?: PathStatusConfig
}

export type EntityRelatedListResponse = {
  relatedList?: RelatedListConfig
  title?: string
  columns?: Array<EntityColumn | string>
  records?: EntityRecord[]
  items?: EntityRecord[]
  data?: EntityRecord[]
  total?: number
  pageSize?: number
  nextCursor?: string | null
  actions?: EntityAction[]
  rowActions?: EntityAction[]
  emptyState?: string
}

export type EntityFormResponse = {
  title?: string
  subtitle?: string
  sections?: RuntimeFormSectionConfig[]
  fieldDefinitions?: EntityFieldDefinition[]
  values?: EntityRecord
  record?: EntityRecord
}

export type EntityFormLookupSearchResponse = {
  items: Array<{
    id: string
    label: string
    objectApiName: string
    subtitle?: string
  }>
}
