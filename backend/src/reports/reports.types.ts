import type { VisibilityEvaluation } from '../visibility/visibility.types';

export type ReportFilterOperator =
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'IN'
  | 'NOT IN'
  | 'LIKE';

export type ReportScalarValue = string | number | boolean | null;

export interface ReportFilter {
  field: string;
  operator: ReportFilterOperator;
  value: ReportScalarValue | ReportScalarValue[];
}

export interface ReportColumn {
  field: string;
  label?: string;
}

export interface ReportGrouping {
  field: string;
  label?: string;
}

export interface ReportSort {
  field: string;
  direction?: 'ASC' | 'DESC' | 'asc' | 'desc';
}

export interface ReportShareGrant {
  subjectType: 'contact' | 'permission';
  subjectId: string;
}

export interface ReportFolderSummary {
  id: string;
  appId: string;
  label: string;
  description?: string;
  ownerContactId: string;
  accessMode: 'personal' | 'shared';
  shares: ReportShareGrant[];
  reportCount: number;
  canEdit: boolean;
  canShare: boolean;
  updatedAt: string;
}

export interface ReportSummary {
  id: string;
  appId: string;
  folderId: string;
  label: string;
  description?: string;
  ownerContactId: string;
  objectApiName: string;
  columns: ReportColumn[];
  groupings: ReportGrouping[];
  shareMode: 'inherit' | 'restricted' | 'personal';
  canEdit: boolean;
  canShare: boolean;
  updatedAt: string;
}

export interface ReportDefinition extends ReportSummary {
  filters: ReportFilter[];
  sort: ReportSort[];
  pageSize: number;
  shares: ReportShareGrant[];
}

export interface ReportsWorkspaceResponse {
  appId: string;
  canWrite: boolean;
  folders: ReportFolderSummary[];
}

export interface ReportFolderResponse {
  canWrite: boolean;
  folder: ReportFolderSummary;
  reports: ReportSummary[];
}

export interface ReportResponse {
  canWrite: boolean;
  report: ReportDefinition;
}

export interface ReportRunColumn {
  field: string;
  label: string;
}

export interface ReportRunRow {
  id: string;
  values: Record<string, unknown>;
}

export interface ReportRunGroupNode {
  key: string;
  field: string;
  label: string;
  value: unknown;
  count: number;
  children?: ReportRunGroupNode[];
  rowIds?: string[];
}

export interface ReportRunResponse {
  report: ReportDefinition;
  columns: ReportRunColumn[];
  rows: ReportRunRow[];
  groups: ReportRunGroupNode[];
  total: number;
  pageSize: number;
  nextCursor: string | null;
  visibility: VisibilityEvaluation;
}

export interface ReportContactSuggestion {
  id: string;
  name?: string;
  recordTypeDeveloperName?: string;
}

export interface ReportPermissionSuggestion {
  code: string;
  label?: string;
}

export interface ReportObjectSuggestion {
  name: string;
  label: string;
  custom: boolean;
}

export interface ReportFieldSuggestion {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

export interface ReportContactSuggestionResponse {
  items: ReportContactSuggestion[];
}

export interface ReportPermissionSuggestionResponse {
  items: ReportPermissionSuggestion[];
}

export interface ReportObjectSuggestionResponse {
  items: ReportObjectSuggestion[];
}

export interface ReportFieldSuggestionResponse {
  items: ReportFieldSuggestion[];
}
