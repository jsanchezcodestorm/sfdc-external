import type { SessionUser } from '../auth/session-user.interface';
import type { VisibilityEvaluation } from '../visibility/visibility.types';

import type {
  EntityColumnConfig,
  EntityConfig,
  EntityFormFieldConfig,
  EntityListViewConfig,
  EntityQueryConfig
} from './entities.types';
import type {
  EntityCursorExecutionInput,
  EntityCursorExecutionResult,
  EntityFieldDefinition,
  EntityFormSectionResponse,
  LookupSearchContext,
  ResolvedLookupMetadata,
  SalesforceFieldSummary,
  SoqlBuildOptions,
  SoqlBuildResult,
  WriteMode
} from './entities.runtime.types';

export interface EntityRuntimeOperations {
  assertRecordInWriteScope(
    user: SessionUser,
    entityId: string,
    objectApiName: string,
    recordId: string,
    visibility: VisibilityEvaluation,
    queryKind: string,
    operation: 'update' | 'delete'
  ): Promise<void>;
  assertSalesforceRecordId(recordId: string): void;
  authorizeEntityWriteAccess(
    user: SessionUser,
    entityId: string,
    objectApiName: string,
    queryKind: string
  ): Promise<VisibilityEvaluation>;
  buildFieldDefinitions(objectApiName: string, fields: string[]): Promise<EntityFieldDefinition[]>;
  buildFormFieldDefinitions(
    objectApiName: string,
    configuredSections: NonNullable<NonNullable<EntityConfig['form']>['sections']>,
    fields: string[],
    mode: WriteMode
  ): Promise<EntityFieldDefinition[]>;
  buildLookupMetadata(
    fieldConfig: EntityFormFieldConfig,
    describe: SalesforceFieldSummary
  ): Promise<ResolvedLookupMetadata | null>;
  buildLookupQueryConfig(
    objectApiName: string,
    lookup: ResolvedLookupMetadata,
    context: LookupSearchContext
  ): EntityQueryConfig;
  buildSoqlFromQueryConfig(query: EntityQueryConfig, options: SoqlBuildOptions): Promise<SoqlBuildResult>;
  clamp(value: number, min: number, max: number): number;
  collectDetailFieldNames(entityConfig: EntityConfig, query: EntityQueryConfig): string[];
  collectFormFieldNames(sections: EntityFormSectionResponse[]): string[];
  ensureVisibleFields(fields: string[], visibility: VisibilityEvaluation, message: string): void;
  executeCursorPaginatedQuery(input: EntityCursorExecutionInput): Promise<EntityCursorExecutionResult>;
  extractColumnFieldPaths(columns: Array<string | { field?: unknown }>): string[];
  extractRecords(result: unknown): { records: Array<Record<string, unknown>>; totalSize: number };
  filterVisibleColumns(
    columns: Array<string | EntityColumnConfig>,
    visibility: VisibilityEvaluation
  ): Array<string | EntityColumnConfig>;
  filterVisibleDetailSections(
    sections: NonNullable<NonNullable<EntityConfig['detail']>['sections']>,
    visibility: VisibilityEvaluation
  ): NonNullable<NonNullable<EntityConfig['detail']>['sections']>;
  findConfiguredFormField(
    sections: NonNullable<NonNullable<EntityConfig['form']>['sections']>,
    fieldName: string
  ): EntityFormFieldConfig | null;
  getDescribeFieldMap(objectApiName: string): Promise<Map<string, SalesforceFieldSummary>>;
  isFieldVisible(fieldPath: string, visibility: VisibilityEvaluation): boolean;
  loadEntityConfig(entityId: string): Promise<EntityConfig>;
  normalizeLookupSearchContext(value: unknown): LookupSearchContext;
  normalizeSearchQuery(search: string | undefined): string | undefined;
  normalizeWritePayload(
    entityConfig: EntityConfig,
    payload: unknown,
    mode: WriteMode
  ): Promise<Record<string, unknown>>;
  readRecordStringValue(record: Record<string, unknown>, fieldPath: string): string | undefined;
  recordWriteVisibilityAudit(visibility: VisibilityEvaluation, queryKind: string): Promise<void>;
  renderRecordTemplate(template: string | undefined, record: Record<string, unknown>): string | undefined;
  resolveDetailTitle(
    titleTemplate: string | undefined,
    fallbackTitle: string | undefined,
    record: Record<string, unknown>,
    entityConfig: EntityConfig
  ): string;
  resolveFormSections(
    formSections: NonNullable<NonNullable<EntityConfig['form']>['sections']>,
    objectApiName: string,
    mode: WriteMode
  ): Promise<EntityFormSectionResponse[]>;
  resolveLookupProjectionFields(objectApiName: string, fieldPaths: string[]): Promise<string[]>;
  selectListView(views: EntityListViewConfig[], requestedViewId?: string): EntityListViewConfig;
}
