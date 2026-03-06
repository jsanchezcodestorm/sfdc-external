export type DetailFieldDraft = {
  label: string
  field: string
  template: string
  highlight: boolean
  format: '' | 'date' | 'datetime'
}

export type DetailSectionDraft = {
  title: string
  fields: DetailFieldDraft[]
}

export type RelatedListDraft = {
  id: string
  label: string
  description: string
  entityId: string
  objectApiName: string
  queryFields: string[]
  queryWhereJson: string
  queryOrderByJson: string
  queryLimit: string
  columns: string
  actionsJson: string
  rowActionsJson: string
  emptyState: string
  pageSize: string
}

export type PathStatusStepDraft = {
  value: string
  label: string
}

export type DetailFormDraft = {
  titleTemplate: string
  fallbackTitle: string
  subtitle: string
  queryFields: string[]
  queryWhereJson: string
  queryOrderByJson: string
  queryLimit: string
  actionsJson: string
  pathStatusEnabled: boolean
  pathStatusField: string
  pathStatusAllowUpdate: boolean
  pathStatusSteps: PathStatusStepDraft[]
  sections: DetailSectionDraft[]
  relatedLists: RelatedListDraft[]
}
