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

export type RelatedListConfig = {
  id: string
  label: string
  description?: string
  entityId?: string
  columns?: Array<EntityColumn | string>
  rowActions?: EntityAction[]
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

export type LookupCondition = {
  field?: string
  operator?: string
  value?: string | number | boolean | null
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
  label: string
  inputType?: 'text' | 'email' | 'tel' | 'date' | 'textarea'
  required?: boolean
  placeholder?: string
  lookup?: LookupConfig
}

export type FormSectionConfig = {
  title: string
  fields: FormFieldConfig[]
}

export type EntityFieldDefinition = {
  field: string
  label: string
  type: string
  nillable: boolean
  createable?: boolean
  updateable?: boolean
  filterable?: boolean
  inputType?: 'text' | 'email' | 'tel' | 'date' | 'textarea'
  required?: boolean
}

export type EntityConfig = {
  id: string
  label?: string
  objectApiName?: string
  list?: {
    title?: string
    subtitle?: string
  }
  detail?: {
    sections?: DetailSectionConfig[]
    relatedLists?: RelatedListConfig[]
  }
  form?: {
    title?: {
      create?: string
      edit?: string
    }
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
}

export type EntityDetailResponse = {
  title?: string
  subtitle?: string
  sections?: DetailSectionConfig[]
  fieldDefinitions?: EntityFieldDefinition[]
  record?: EntityRecord
  data?: EntityRecord
  relatedLists?: RelatedListConfig[]
}

export type EntityRelatedListResponse = {
  relatedList?: RelatedListConfig
  title?: string
  columns?: Array<EntityColumn | string>
  records?: EntityRecord[]
  items?: EntityRecord[]
  data?: EntityRecord[]
  total?: number
}

export type EntityFormResponse = {
  title?: string
  subtitle?: string
  sections?: FormSectionConfig[]
  fieldDefinitions?: EntityFieldDefinition[]
  values?: EntityRecord
  record?: EntityRecord
}
