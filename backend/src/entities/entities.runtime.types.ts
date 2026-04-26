import type { SessionUser } from '../auth/session-user.interface';
import type {
  SalesforceFieldSummary,
  SalesforcePicklistValueSummary
} from '../salesforce/salesforce.service';
import type { VisibilityEvaluation } from '../visibility/visibility.types';

import type {
  EntityActionConfig,
  EntityColumnConfig,
  EntityConfig,
  EntityListSearchConfig,
  EntityListViewConfig,
  EntityLookupCondition,
  EntityLookupOrderBy,
  EntityPathStatusConfig,
  EntityQueryConfig,
  EntityQueryScalarValue,
  EntityQueryWhere
} from './entities.types';

export const MAX_PAGE_SIZE = 2000;
export const DEFAULT_PAGE_SIZE = 50;
export const SOQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;
export const WRITE_FIELD_API_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const SALESFORCE_ID_PATTERN = /^[A-Za-z0-9]{15,18}$/;
export const TEMPLATE_TOKEN_PATTERN = /\{\{\s*([^}]+)\s*\}\}/g;

export const TEXT_SEARCH_TYPES = new Set([
  'string',
  'textarea',
  'longtextarea',
  'richtextarea',
  'phone',
  'email',
  'url',
  'id',
  'reference',
  'picklist',
  'multipicklist'
]);

export const NUMERIC_SEARCH_TYPES = new Set(['int', 'double', 'currency', 'percent']);
export const ENTITY_CREATE_QUERY_KIND = 'ENTITY_CREATE';
export const ENTITY_UPDATE_QUERY_KIND = 'ENTITY_UPDATE';
export const ENTITY_DELETE_QUERY_KIND = 'ENTITY_DELETE';
export const ENTITY_UPDATE_PREFLIGHT_QUERY_KIND = 'ENTITY_UPDATE_PREFLIGHT';
export const ENTITY_DELETE_PREFLIGHT_QUERY_KIND = 'ENTITY_DELETE_PREFLIGHT';
export const ENTITY_FORM_LOOKUP_QUERY_KIND = 'ENTITY_FORM_LOOKUP';
export const ENTITY_FORM_LOOKUP_LIMIT = 8;
export const SYSTEM_MANAGED_FIELD_NAMES = new Set([
  'id',
  'ownerid',
  'recordtypeid',
  'createdbyid',
  'lastmodifiedbyid',
  'createddate',
  'lastmodifieddate',
  'systemmodstamp'
]);

export type FormInputType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'lookup';

export type WriteMode = 'create' | 'update';

export type LookupSearchContext = Record<string, string | number | boolean | null | undefined>;

export interface EntityFieldOption {
  value: string;
  label: string;
  default?: boolean;
}

export interface EntityFieldLookupMetadata {
  referenceTo: string[];
  searchField: string;
  where?: EntityLookupCondition[];
  orderBy?: EntityLookupOrderBy[];
  prefill?: boolean;
}

export interface ResolvedLookupMetadata extends EntityFieldLookupMetadata {
  displayField: string;
  relationshipName: string;
}

export interface EntityFieldDefinition {
  field: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  inputType: FormInputType;
  required: boolean;
  options?: EntityFieldOption[];
  lookup?: EntityFieldLookupMetadata;
}

export interface SoqlBuildOptions {
  context?: Record<string, unknown>;
  forcedLimit?: number;
  ignoreConfiguredLimit?: boolean;
  search?: string;
  searchConfig?: EntityListSearchConfig;
  extraFields?: string[];
  visibility?: VisibilityEvaluation;
}

export interface SoqlBuildResult {
  soql: string;
  baseWhere?: string;
  finalWhere?: string;
  selectFields: string[];
}

export interface EntityListResponse {
  title: string;
  subtitle?: string;
  columns: EntityListViewConfig['columns'];
  primaryAction?: EntityActionConfig;
  rowActions?: EntityActionConfig[];
  records: Array<Record<string, unknown>>;
  total: number;
  pageSize: number;
  nextCursor: string | null;
  viewId?: string;
  visibility: VisibilityEvaluation;
}

export interface EntityDetailResponse {
  title: string;
  subtitle?: string;
  sections?: NonNullable<EntityConfig['detail']>['sections'];
  actions?: EntityActionConfig[];
  pathStatus?: EntityPathStatusConfig;
  record: Record<string, unknown>;
  data: Record<string, unknown>;
  relatedLists?: NonNullable<EntityConfig['detail']>['relatedLists'];
  fieldDefinitions: EntityFieldDefinition[];
  visibility: VisibilityEvaluation;
}

export interface EntityFormSectionResponse {
  title: string;
  fields: Array<{
    field: string;
    label: string;
    inputType: FormInputType;
    required: boolean;
    placeholder?: string;
    options?: EntityFieldOption[];
    lookup?: EntityFieldLookupMetadata;
  }>;
}

export interface EntityFormResponse {
  title: string;
  subtitle?: string;
  sections: EntityFormSectionResponse[];
  values?: Record<string, unknown>;
  record?: Record<string, unknown>;
  fieldDefinitions: EntityFieldDefinition[];
  visibility: VisibilityEvaluation;
}

export interface EntityRelatedListResponse {
  relatedList: NonNullable<NonNullable<EntityConfig['detail']>['relatedLists']>[number];
  title: string;
  columns: NonNullable<NonNullable<EntityConfig['detail']>['relatedLists']>[number]['columns'];
  actions?: NonNullable<NonNullable<EntityConfig['detail']>['relatedLists']>[number]['actions'];
  rowActions?: NonNullable<NonNullable<EntityConfig['detail']>['relatedLists']>[number]['rowActions'];
  emptyState?: string;
  records: Array<Record<string, unknown>>;
  total: number;
  pageSize: number;
  nextCursor: string | null;
  visibility: VisibilityEvaluation;
}

export interface EntityFormLookupSearchResult {
  items: Array<{
    id: string;
    label: string;
    objectApiName: string;
    subtitle?: string;
  }>;
}

export interface EntityCursorExecutionInput {
  user: SessionUser;
  cursor?: string;
  cursorKind: 'list' | 'related-list';
  queryKind: 'ENTITY_LIST' | 'ENTITY_RELATED_LIST';
  entityId: string;
  objectApiName: string;
  pageSize: number;
  resolvedSoql: string;
  baseWhere: string;
  finalWhere: string;
  visibility: VisibilityEvaluation;
  metadata: Record<string, unknown>;
  recordId?: string;
  viewId?: string;
  relatedListId?: string;
  search?: string;
  selectedFields: string[];
}

export interface EntityCursorExecutionResult {
  records: Array<Record<string, unknown>>;
  totalSize: number;
  nextCursor: string | null;
}

export type DescribeFieldMapLoader = (objectApiName: string) => Promise<Map<string, SalesforceFieldSummary>>;

export type FieldVisibilityApplier = (
  fields: string[],
  visibility: VisibilityEvaluation
) => string[];

export type {
  EntityColumnConfig,
  EntityConfig,
  EntityLookupCondition,
  EntityQueryConfig,
  EntityQueryScalarValue,
  EntityQueryWhere,
  SalesforceFieldSummary,
  SalesforcePicklistValueSummary,
  VisibilityEvaluation
};
