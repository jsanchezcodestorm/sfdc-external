import type { QueryTemplate } from './query-template-admin-types'

export const NEW_QUERY_TEMPLATE_SENTINEL = '__new__'

export type DefaultParamDraft = {
  key: string
  type: 'string' | 'number' | 'boolean'
  value: string
}

export type QueryTemplateDraft = {
  id: string
  objectApiName: string
  description: string
  soql: string
  maxLimit: string
  defaultParams: DefaultParamDraft[]
}

export function buildQueryTemplateListPath(): string {
  return '/admin/query-templates'
}

export function buildQueryTemplateCreatePath(): string {
  return `${buildQueryTemplateListPath()}/${NEW_QUERY_TEMPLATE_SENTINEL}`
}

export function buildQueryTemplateViewPath(templateId: string): string {
  return `${buildQueryTemplateListPath()}/${encodeURIComponent(templateId)}`
}

export function buildQueryTemplateEditPath(templateId: string): string {
  return `${buildQueryTemplateViewPath(templateId)}/edit`
}

export function createEmptyQueryTemplateDraft(): QueryTemplateDraft {
  return {
    id: '',
    objectApiName: '',
    description: '',
    soql: '',
    maxLimit: '',
    defaultParams: [],
  }
}

export function createQueryTemplateDraft(template: QueryTemplate): QueryTemplateDraft {
  return {
    id: template.id,
    objectApiName: template.objectApiName,
    description: template.description ?? '',
    soql: template.soql,
    maxLimit: template.maxLimit ? String(template.maxLimit) : '',
    defaultParams: Object.entries(template.defaultParams ?? {}).map(([key, value]) => ({
      key,
      type:
        typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
      value: String(value),
    })),
  }
}

export function parseQueryTemplateDraft(draft: QueryTemplateDraft): QueryTemplate {
  const id = draft.id.trim()
  const objectApiName = draft.objectApiName.trim()
  const soql = draft.soql.trim()

  if (!id) {
    throw new Error('Template ID obbligatorio')
  }

  if (!objectApiName) {
    throw new Error('Object API Name obbligatorio')
  }

  if (!soql) {
    throw new Error('SOQL obbligatoria')
  }

  const defaultParamsEntries = draft.defaultParams
    .filter((param) => param.key.trim().length > 0)
    .map<[string, string | number | boolean]>((param) => {
      const key = param.key.trim()

      if (param.type === 'number') {
        const parsed = Number(param.value)
        if (!Number.isFinite(parsed)) {
          throw new Error(`Default param ${key} deve essere numerico`)
        }

        return [key, parsed]
      }

      if (param.type === 'boolean') {
        const normalized = param.value.trim().toLowerCase()
        if (normalized !== 'true' && normalized !== 'false') {
          throw new Error(`Default param ${key} deve essere true o false`)
        }

        return [key, normalized === 'true']
      }

      return [key, param.value]
    })

  const maxLimit = draft.maxLimit.trim().length > 0 ? Number(draft.maxLimit) : undefined
  if (maxLimit !== undefined && (!Number.isInteger(maxLimit) || maxLimit <= 0)) {
    throw new Error('Max limit deve essere un intero positivo')
  }

  return {
    id,
    objectApiName,
    description: draft.description.trim() || undefined,
    soql,
    defaultParams:
      defaultParamsEntries.length > 0 ? Object.fromEntries(defaultParamsEntries) : undefined,
    maxLimit,
  }
}
