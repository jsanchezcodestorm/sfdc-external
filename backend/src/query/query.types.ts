export interface QueryTemplate {
  id: string;
  objectApiName: string;
  description?: string;
  soql: string;
  defaultParams?: Record<string, string | number | boolean>;
  maxLimit?: number;
}

export type QueryTemplateParams = Record<string, string | number | boolean>;
