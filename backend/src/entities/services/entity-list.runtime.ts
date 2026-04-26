import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { SessionUser } from '../../auth/session-user.interface';
import type { ResourceAccessService } from '../../common/services/resource-access.service';

import type { GetEntityListDto } from '../dto/get-entity-list.dto';
import type { GetEntityRelatedListDto } from '../dto/get-entity-related-list.dto';
import type { EntityRuntimeOperations } from '../entities.runtime.operations';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type EntityListResponse,
  type EntityRelatedListResponse
} from '../entities.runtime.types';

import type { EntityQueryCursorService } from './entity-query-cursor.service';

export class EntityListRuntime {
  constructor(
    private readonly entityQueryCursorService: EntityQueryCursorService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly operations: EntityRuntimeOperations
  ) {}

  async getEntityList(user: SessionUser, entityId: string, query: GetEntityListDto): Promise<EntityListResponse> {
    await this.entityQueryCursorService.deleteExpiredCursors();
    const entityConfig = await this.operations.loadEntityConfig(entityId);
    const listConfig = entityConfig.list;

    if (!listConfig || listConfig.views.length === 0) {
      throw new NotFoundException(`List view is not configured for ${entityId}`);
    }

    const selectedView = this.operations.selectListView(listConfig.views, query.viewId);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      selectedView.query.object,
      {
        queryKind: 'ENTITY_LIST'
      }
    );
    const configuredPageSize = this.operations.clamp(selectedView.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const pageSize = this.operations.clamp(query.pageSize ?? configuredPageSize, 1, MAX_PAGE_SIZE);
    const search = this.operations.normalizeSearchQuery(query.search);
    const visibleColumns = this.operations.filterVisibleColumns(selectedView.columns, visibility);
    const visibleColumnFields = this.operations.extractColumnFieldPaths(visibleColumns);
    this.operations.ensureVisibleFields(visibleColumnFields, visibility, 'No visible list field available');
    const lookupProjectionFields = await this.operations.resolveLookupProjectionFields(
      selectedView.query.object,
      visibleColumnFields
    );

    const scopedQuery = await this.operations.buildSoqlFromQueryConfig(selectedView.query, {
      ignoreConfiguredLimit: true,
      search,
      searchConfig: selectedView.search,
      extraFields: lookupProjectionFields,
      visibility
    });
    const paginationResult = await this.operations.executeCursorPaginatedQuery({
      user,
      cursor: query.cursor,
      cursorKind: 'list',
      queryKind: 'ENTITY_LIST',
      entityId,
      objectApiName: selectedView.query.object,
      pageSize,
      resolvedSoql: scopedQuery.soql,
      baseWhere: scopedQuery.baseWhere ?? '',
      finalWhere: scopedQuery.finalWhere ?? '',
      visibility,
      viewId: selectedView.id,
      search,
      selectedFields: scopedQuery.selectFields,
      metadata: {
        entityId,
        viewId: selectedView.id,
        pageSize,
        search,
        selectedFields: scopedQuery.selectFields
      }
    });

    return {
      title: listConfig.title,
      subtitle: listConfig.subtitle,
      columns: visibleColumns,
      primaryAction: selectedView.primaryAction ?? listConfig.primaryAction,
      rowActions: selectedView.rowActions,
      records: paginationResult.records,
      total: paginationResult.totalSize,
      pageSize,
      nextCursor: paginationResult.nextCursor,
      viewId: selectedView.id,
      visibility
    };
  }

  async getEntityRelatedList(
    user: SessionUser,
    entityId: string,
    relatedListId: string,
    params: GetEntityRelatedListDto
  ): Promise<EntityRelatedListResponse> {
    await this.entityQueryCursorService.deleteExpiredCursors();
    const entityConfig = await this.operations.loadEntityConfig(entityId);

    const recordId = params.recordId?.trim() ?? '';
    if (!recordId) {
      throw new BadRequestException('recordId query parameter is required');
    }
    this.operations.assertSalesforceRecordId(recordId);

    const relatedLists = entityConfig.detail?.relatedLists ?? [];
    const relatedList = relatedLists.find((entry) => entry.id === relatedListId);
    if (!relatedList) {
      throw new NotFoundException(`Related list ${relatedListId} is not configured for ${entityId}`);
    }

    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      relatedList.query.object,
      {
        queryKind: 'ENTITY_RELATED_LIST'
      }
    );
    const configuredPageSize = this.operations.clamp(relatedList.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const pageSize = this.operations.clamp(params.pageSize ?? configuredPageSize, 1, MAX_PAGE_SIZE);
    const visibleColumns = this.operations.filterVisibleColumns(relatedList.columns, visibility);
    const visibleColumnFields = this.operations.extractColumnFieldPaths(visibleColumns);
    this.operations.ensureVisibleFields(visibleColumnFields, visibility, 'No visible related-list field available');
    const lookupProjectionFields = await this.operations.resolveLookupProjectionFields(
      relatedList.query.object,
      visibleColumnFields
    );

    const scopedQuery = await this.operations.buildSoqlFromQueryConfig(relatedList.query, {
      context: { id: recordId, recordId },
      ignoreConfiguredLimit: true,
      extraFields: lookupProjectionFields,
      visibility
    });
    const paginationResult = await this.operations.executeCursorPaginatedQuery({
      user,
      cursor: params.cursor,
      cursorKind: 'related-list',
      queryKind: 'ENTITY_RELATED_LIST',
      entityId,
      objectApiName: relatedList.query.object,
      pageSize,
      resolvedSoql: scopedQuery.soql,
      baseWhere: scopedQuery.baseWhere ?? '',
      finalWhere: scopedQuery.finalWhere ?? '',
      visibility,
      recordId,
      relatedListId,
      selectedFields: scopedQuery.selectFields,
      metadata: {
        entityId,
        relatedListId,
        recordId,
        pageSize,
        selectedFields: scopedQuery.selectFields
      }
    });

    return {
      relatedList,
      title: relatedList.label,
      columns: visibleColumns,
      actions: relatedList.actions,
      rowActions: relatedList.rowActions,
      emptyState: relatedList.emptyState,
      records: paginationResult.records,
      total: paginationResult.totalSize,
      pageSize,
      nextCursor: paginationResult.nextCursor,
      visibility
    };
  }
}
