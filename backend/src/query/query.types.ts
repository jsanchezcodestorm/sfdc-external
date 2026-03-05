export interface QueryTemplate {
  id: string;
  objectApiName: string;
  soql: string;
  defaultParams?: Record<string, string | number | boolean>;
  maxLimit?: number;
}

export type QueryTemplateParams = Record<string, string | number | boolean>;
