export type FormLookupDraft = {
  searchField: string
  prefill: boolean
  whereJson: string
  orderByJson: string
}

export type FormFieldDraft = {
  field: string
  placeholder: string
  lookup: FormLookupDraft
}

export type FormSectionDraft = {
  title: string
  fields: FormFieldDraft[]
}

export type FormFormDraft = {
  createTitle: string
  editTitle: string
  subtitle: string
  queryFields: string[]
  queryWhereJson: string
  queryOrderByJson: string
  queryLimit: string
  sections: FormSectionDraft[]
}
