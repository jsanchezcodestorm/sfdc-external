export type EntityQueryContext = Record<string, string | number | boolean | null | undefined>;

export type EntityQueryScalarValue = string | number | boolean | null;

export type EntityQueryOperator =
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'IN'
  | 'NOT IN'
  | 'LIKE';

export type EntityQueryWhereObject = {
  field: string;
  operator: EntityQueryOperator;
  value: EntityQueryScalarValue | EntityQueryScalarValue[];
};

export type EntityQueryWhere = EntityQueryWhereObject;

export interface EntityQueryOrderBy {
  field: string;
  direction?: 'ASC' | 'DESC' | 'asc' | 'desc';
}

export interface EntityQueryConfig {
  object: string;
  fields?: string[];
  where?: EntityQueryWhere[];
  orderBy?: EntityQueryOrderBy[];
  limit?: number;
}

export interface EntityActionConfig {
  type: 'edit' | 'delete' | 'link';
  label?: string;
  target?: string;
  entityId?: string;
}

export interface EntityColumnConfig {
  field: string;
  label?: string;
}

export interface EntityListSearchConfig {
  fields?: string[];
  minLength?: number;
}

export interface EntityListViewConfig {
  id: string;
  label: string;
  query: EntityQueryConfig;
  columns: Array<string | EntityColumnConfig>;
  description?: string;
  default?: boolean;
  pageSize?: number;
  search?: EntityListSearchConfig;
  primaryAction?: EntityActionConfig;
  rowActions?: EntityActionConfig[];
}

export interface EntityListConfig {
  title: string;
  subtitle?: string;
  primaryAction?: EntityActionConfig;
  views: EntityListViewConfig[];
}

export interface EntityDetailSectionFieldConfig {
  label?: string;
  field?: string;
  template?: string;
  highlight?: boolean;
  format?: 'date' | 'datetime';
}

export interface EntityDetailSectionConfig {
  title: string;
  fields: EntityDetailSectionFieldConfig[];
}

export interface EntityRelatedListConfig {
  id: string;
  label: string;
  query: EntityQueryConfig;
  columns: Array<string | EntityColumnConfig>;
  description?: string;
  actions?: EntityActionConfig[];
  rowActions?: EntityActionConfig[];
  emptyState?: string;
  pageSize?: number;
  entityId?: string;
}

export interface EntityPathStatusStep {
  value: string;
  label?: string;
}

export interface EntityPathStatusConfig {
  field: string;
  steps: EntityPathStatusStep[];
  allowUpdate?: boolean;
}

export interface EntityDetailConfig {
  query: EntityQueryConfig;
  sections: EntityDetailSectionConfig[];
  relatedLists?: EntityRelatedListConfig[];
  titleTemplate?: string;
  fallbackTitle?: string;
  subtitle?: string;
  actions?: EntityActionConfig[];
  pathStatus?: EntityPathStatusConfig;
}

export interface EntityFormTitleConfig {
  create: string;
  edit: string;
}

export interface EntityLookupCondition {
  field?: string;
  operator?: string;
  value?: string | number | boolean | null;
  parentRel?: string;
}

export interface EntityLookupOrderBy {
  field: string;
  direction?: 'ASC' | 'DESC' | 'asc' | 'desc';
}

export interface EntityLookupConfig {
  searchField?: string;
  where?: EntityLookupCondition[];
  orderBy?: EntityLookupOrderBy[];
  prefill?: boolean;
}

export interface EntityFormFieldConfig {
  field: string;
  placeholder?: string;
  lookup?: EntityLookupConfig;
}

export interface EntityFormSectionConfig {
  title?: string;
  fields?: EntityFormFieldConfig[];
}

export interface EntityFormConfig {
  title: EntityFormTitleConfig;
  query: EntityQueryConfig;
  subtitle?: string;
  sections: EntityFormSectionConfig[];
}

export interface EntityLayoutAssignmentConfig {
  recordTypeDeveloperName?: string;
  permissionCode?: string;
  priority?: number;
}

export interface EntityLayoutConfig {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
  detail?: EntityDetailConfig;
  form?: EntityFormConfig;
  assignments: EntityLayoutAssignmentConfig[];
}

export interface EntityBaseNavigationConfig {
  basePath?: string;
}

export interface EntityConfig {
  id: string;
  objectApiName: string;
  label?: string;
  description?: string;
  navigation?: EntityBaseNavigationConfig;
  list?: EntityListConfig;
  layouts: EntityLayoutConfig[];
  [key: string]: unknown;
}
