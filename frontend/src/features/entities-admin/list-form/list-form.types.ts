export type ListActionDraft = {
  type: '' | 'edit' | 'delete' | 'link'
  label: string
  target: string
  entityId: string
}

export type ListViewDraft = {
  id: string
  label: string
  description: string
  default: boolean
  pageSize: string
  queryFields: string[]
  queryWhereJson: string
  queryOrderByJson: string
  queryLimit: string
  columns: string
  searchFields: string[]
  searchMinLength: string
  primaryAction: ListActionDraft
  rowActionsJson: string
}

export type ListFormDraft = {
  title: string
  subtitle: string
  primaryAction: ListActionDraft
  views: ListViewDraft[]
}
