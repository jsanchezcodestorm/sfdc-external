import type { EntityLayoutConfig, LookupConfig } from '../../../entities/entity-types'
import type { FormFieldDraft, FormFormDraft, FormLookupDraft, FormSectionDraft } from './form-form.types'

type FormConfigValue = NonNullable<EntityLayoutConfig['form']>
type FormSectionValue = NonNullable<FormConfigValue['sections']>[number]
type FormFieldValue = FormSectionValue['fields'][number]

export function createEmptyFormLookupDraft(): FormLookupDraft {
  return {
    searchField: '',
    prefill: false,
    whereJson: '',
    orderByJson: '',
  }
}

export function createEmptyFormFieldDraft(): FormFieldDraft {
  return {
    field: '',
    placeholder: '',
    lookup: createEmptyFormLookupDraft(),
  }
}

export function createEmptyFormSectionDraft(): FormSectionDraft {
  return {
    title: '',
    fields: [createEmptyFormFieldDraft()],
  }
}

export function createEmptyFormDraft(): FormFormDraft {
  return {
    createTitle: '',
    editTitle: '',
    subtitle: '',
    queryFields: [],
    queryWhereJson: '',
    queryOrderByJson: '',
    queryLimit: '',
    sections: [createEmptyFormSectionDraft()],
  }
}

export function createFormDraft(form: EntityLayoutConfig['form'] | undefined): FormFormDraft {
  if (!form) {
    return createEmptyFormDraft()
  }

  const query = form.query
  const sections = (form.sections ?? []).map((section) => createFormSectionDraft(section))

  return {
    createTitle: form.title?.create ?? '',
    editTitle: form.title?.edit ?? '',
    subtitle: form.subtitle ?? '',
    queryFields: asStringArray(query?.fields),
    queryWhereJson: Array.isArray(query?.where) ? JSON.stringify(query.where, null, 2) : '',
    queryOrderByJson: Array.isArray(query?.orderBy) ? JSON.stringify(query.orderBy, null, 2) : '',
    queryLimit:
      typeof query?.limit === 'number' && Number.isFinite(query.limit) ? String(query.limit) : '',
    sections: sections.length > 0 ? sections : [createEmptyFormSectionDraft()],
  }
}

export function parseFormDraft(
  draft: FormFormDraft,
  baseObjectApiName: string,
): NonNullable<EntityLayoutConfig['form']> {
  const normalizedBaseObjectApiName = readRequiredString(
    baseObjectApiName,
    'Base objectApiName obbligatorio per la sezione Form',
  )
  const queryFields = draft.queryFields
    .map((field) => field.trim())
    .filter((field) => field.length > 0)

  if (queryFields.length === 0) {
    throw new Error('Form: query.fields deve contenere almeno un campo')
  }

  const query: NonNullable<FormConfigValue['query']> = {
    object: normalizedBaseObjectApiName,
    fields: queryFields,
  }

  const where = parseOptionalJsonArray(draft.queryWhereJson, 'Form: query.where')
  if (where) {
    query.where = where as NonNullable<NonNullable<FormConfigValue['query']>['where']>
  }

  const orderBy = parseOptionalJsonArray(draft.queryOrderByJson, 'Form: query.orderBy')
  if (orderBy) {
    query.orderBy = orderBy as NonNullable<NonNullable<FormConfigValue['query']>['orderBy']>
  }

  const queryLimit = parsePositiveInteger(draft.queryLimit, 'Form: query.limit')
  if (queryLimit !== undefined) {
    query.limit = queryLimit
  }

  const sections = draft.sections
    .map((section, index) => parseFormSectionDraft(section, index))
    .filter((section): section is FormSectionValue => section !== null)

  if (sections.length === 0) {
    throw new Error('Form: sections deve contenere almeno una sezione')
  }

  return {
    title: {
      create: readRequiredString(draft.createTitle, 'Form: title.create obbligatorio'),
      edit: readRequiredString(draft.editTitle, 'Form: title.edit obbligatorio'),
    },
    query,
    subtitle: readOptionalString(draft.subtitle),
    sections,
  }
}

function createFormSectionDraft(section: FormSectionValue): FormSectionDraft {
  return {
    title: section.title ?? '',
    fields:
      section.fields?.map((field) => ({
        field: field.field ?? '',
        placeholder: field.placeholder ?? '',
        lookup: createFormLookupDraft(field.lookup),
      })) ?? [createEmptyFormFieldDraft()],
  }
}

function createFormLookupDraft(lookup: LookupConfig | undefined): FormLookupDraft {
  if (!lookup) {
    return createEmptyFormLookupDraft()
  }

  return {
    searchField: lookup.searchField ?? '',
    prefill: Boolean(lookup.prefill),
    whereJson: Array.isArray(lookup.where) ? JSON.stringify(lookup.where, null, 2) : '',
    orderByJson: Array.isArray(lookup.orderBy) ? JSON.stringify(lookup.orderBy, null, 2) : '',
  }
}

function parseFormSectionDraft(section: FormSectionDraft, index: number): FormSectionValue | null {
  const title = readOptionalString(section.title)
  const fields = section.fields
    .map((field, fieldIndex) => parseFormFieldDraft(field, index, fieldIndex))
    .filter((field): field is FormFieldValue => field !== null)
  const hasAnyValue = Boolean(title) || section.fields.some((field) => hasAnyFieldValue(field))

  if (!hasAnyValue) {
    return null
  }

  if (fields.length === 0) {
    throw new Error(`Form section ${index + 1}: deve contenere almeno un field`)
  }

  return {
    title,
    fields,
  } as FormSectionValue
}

function parseFormFieldDraft(
  field: FormFieldDraft,
  sectionIndex: number,
  fieldIndex: number,
): FormFieldValue | null {
  const fieldPath = readOptionalString(field.field)
  const placeholder = readOptionalString(field.placeholder)
  const hasAnyValue = hasAnyFieldValue(field)

  if (!hasAnyValue) {
    return null
  }

  if (!fieldPath) {
    throw new Error(`Form section ${sectionIndex + 1} field ${fieldIndex + 1}: field obbligatorio`)
  }

  return {
    field: fieldPath,
    placeholder,
    lookup: parseLookupDraft(field, sectionIndex, fieldIndex),
  }
}

function parseLookupDraft(
  field: FormFieldDraft,
  sectionIndex: number,
  fieldIndex: number,
): LookupConfig | undefined {
  const label = `Form section ${sectionIndex + 1} field ${fieldIndex + 1}: lookup`
  const searchField = readOptionalString(field.lookup.searchField)
  const where = parseOptionalJsonArray(field.lookup.whereJson, `${label}.where`)
  const orderBy = parseOptionalJsonArray(field.lookup.orderByJson, `${label}.orderBy`)
  const prefill = field.lookup.prefill

  if (!searchField && !where && !orderBy && !prefill) {
    return undefined
  }

  return {
    searchField,
    prefill: prefill ? true : undefined,
    where: where as LookupConfig['where'],
    orderBy: orderBy as LookupConfig['orderBy'],
  }
}

function hasAnyFieldValue(field: FormFieldDraft): boolean {
  return (
    field.field.trim().length > 0 ||
    field.placeholder.trim().length > 0 ||
    field.lookup.searchField.trim().length > 0 ||
    field.lookup.whereJson.trim().length > 0 ||
    field.lookup.orderByJson.trim().length > 0 ||
    field.lookup.prefill
  )
}

function parseOptionalJsonArray(value: string, label: string): unknown[] | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON non valido'
    throw new Error(`${label}: ${message}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label}: deve essere un array JSON`)
  }

  return parsed
}

function parsePositiveInteger(value: string, label: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label}: deve essere un intero positivo`)
  }

  return parsed
}

function readRequiredString(value: string, errorMessage: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(errorMessage)
  }

  return trimmed
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}
