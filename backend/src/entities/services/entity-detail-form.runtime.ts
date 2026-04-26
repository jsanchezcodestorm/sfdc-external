import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { QueryAuditService } from '../../audit/query-audit.service';
import type { SessionUser } from '../../auth/session-user.interface';
import type { ResourceAccessService } from '../../common/services/resource-access.service';
import type { VisibilityService } from '../../visibility/visibility.service';
import type { VisibilityEvaluation } from '../../visibility/visibility.types';

import type { SearchEntityFormLookupDto } from '../dto/search-entity-form-lookup.dto';
import type { EntityRuntimeOperations } from '../entities.runtime.operations';
import {
  ENTITY_FORM_LOOKUP_LIMIT,
  ENTITY_FORM_LOOKUP_QUERY_KIND,
  WRITE_FIELD_API_NAME_PATTERN,
  type EntityDetailResponse,
  type EntityFormLookupSearchResult,
  type EntityFormResponse,
  type WriteMode
} from '../entities.runtime.types';

export class EntityDetailFormRuntime {
  constructor(
    private readonly queryAuditService: QueryAuditService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly visibilityService: VisibilityService,
    private readonly operations: EntityRuntimeOperations
  ) {}

  async getEntityRecord(user: SessionUser, entityId: string, recordId: string): Promise<EntityDetailResponse> {
    const entityConfig = await this.operations.loadEntityConfig(entityId);
    this.operations.assertSalesforceRecordId(recordId);

    const detailConfig = entityConfig.detail;
    if (!detailConfig) {
      throw new NotFoundException(`Detail view is not configured for ${entityId}`);
    }

    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      detailConfig.query.object,
      {
        queryKind: 'ENTITY_DETAIL'
      }
    );
    const visibleSections = this.operations.filterVisibleDetailSections(detailConfig.sections, visibility);
    const visibleRelatedLists = (detailConfig.relatedLists ?? []).map((relatedList) => ({
      ...relatedList,
      columns: this.operations.filterVisibleColumns(relatedList.columns, visibility)
    }));
    const detailFieldNames = this.operations.collectDetailFieldNames(
      {
        ...entityConfig,
        detail: {
          ...detailConfig,
          sections: visibleSections
        }
      },
      detailConfig.query
    );
    this.operations.ensureVisibleFields(detailFieldNames, visibility, 'No visible detail field available');
    const lookupProjectionFields = await this.operations.resolveLookupProjectionFields(
      detailConfig.query.object,
      detailFieldNames
    );

    const scopedQuery = await this.operations.buildSoqlFromQueryConfig(detailConfig.query, {
      context: { id: recordId, recordId },
      forcedLimit: 1,
      extraFields: lookupProjectionFields,
      visibility
    });
    const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'ENTITY_DETAIL',
      targetId: entityId,
      objectApiName: detailConfig.query.object,
      recordId,
      resolvedSoql: scopedQuery.soql,
      visibility,
      baseWhere: scopedQuery.baseWhere,
      finalWhere: scopedQuery.finalWhere,
      metadata: {
        entityId,
        selectedFields: scopedQuery.selectFields
      }
    });
    const { records } = this.operations.extractRecords(rawQueryResult);

    if (records.length === 0) {
      throw new NotFoundException(`Record ${recordId} not found`);
    }

    const record = records[0];
    const fieldDefinitions = await this.operations.buildFieldDefinitions(
      detailConfig.query.object,
      detailFieldNames
    );

    const title = this.operations.resolveDetailTitle(
      detailConfig.titleTemplate,
      detailConfig.fallbackTitle,
      record,
      entityConfig
    );
    const subtitle = this.operations.renderRecordTemplate(detailConfig.subtitle, record);

    return {
      title,
      subtitle,
      sections: visibleSections,
      actions: detailConfig.actions,
      pathStatus: detailConfig.pathStatus,
      record,
      data: record,
      relatedLists: visibleRelatedLists,
      fieldDefinitions,
      visibility
    };
  }

  async getEntityForm(user: SessionUser, entityId: string, recordId?: string): Promise<EntityFormResponse> {
    const entityConfig = await this.operations.loadEntityConfig(entityId);
    const mode: WriteMode = recordId ? 'update' : 'create';

    const formConfig = entityConfig.form;
    if (!formConfig || !formConfig.sections || formConfig.sections.length === 0) {
      throw new NotFoundException(`Form is not configured for ${entityId}`);
    }

    if (recordId) {
      this.operations.assertSalesforceRecordId(recordId);
    }

    const sections = await this.operations.resolveFormSections(formConfig.sections, entityConfig.objectApiName, mode);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `entity:${entityId}`,
      formConfig.query.object,
      {
        queryKind: 'ENTITY_FORM'
      }
    );
    const visibleSections = sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => this.operations.isFieldVisible(field.field, visibility))
      }))
      .filter((section) => section.fields.length > 0);
    const visibleFormFields = this.operations.collectFormFieldNames(visibleSections);
    this.operations.ensureVisibleFields(visibleFormFields, visibility, 'No visible form field available');
    const fieldDefinitions = await this.operations.buildFormFieldDefinitions(
      entityConfig.objectApiName,
      formConfig.sections,
      visibleFormFields,
      mode
    );
    const formTitle = recordId ? formConfig.title?.edit : formConfig.title?.create;
    const title = formTitle && formTitle.trim().length > 0 ? formTitle : `${recordId ? 'Edit' : 'New'} ${entityConfig.label ?? entityConfig.id}`;

    if (!recordId) {
      await this.visibilityService.recordAudit({
        evaluation: visibility,
        queryKind: 'ENTITY_FORM',
        rowCount: 0,
        durationMs: 0
      });
      return {
        title,
        subtitle: formConfig.subtitle,
        sections: visibleSections,
        fieldDefinitions,
        visibility
      };
    }

    if (!formConfig.query) {
      throw new NotFoundException(`Form query is not configured for ${entityId}`);
    }

    const scopedQuery = await this.operations.buildSoqlFromQueryConfig(formConfig.query, {
      context: { id: recordId, recordId },
      forcedLimit: 1,
      extraFields: await this.operations.resolveLookupProjectionFields(entityConfig.objectApiName, visibleFormFields),
      visibility
    });
    const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'ENTITY_FORM',
      targetId: entityId,
      objectApiName: formConfig.query.object,
      recordId,
      resolvedSoql: scopedQuery.soql,
      visibility,
      baseWhere: scopedQuery.baseWhere,
      finalWhere: scopedQuery.finalWhere,
      metadata: {
        entityId,
        recordId,
        selectedFields: scopedQuery.selectFields
      }
    });
    const { records } = this.operations.extractRecords(rawQueryResult);

    if (records.length === 0) {
      throw new NotFoundException(`Record ${recordId} not found`);
    }

    const record = records[0];

    return {
      title,
      subtitle: this.operations.renderRecordTemplate(formConfig.subtitle, record),
      sections: visibleSections,
      values: record,
      record,
      fieldDefinitions,
      visibility
    };
  }

  async searchEntityFormLookup(
    user: SessionUser,
    entityId: string,
    fieldName: string,
    payload: SearchEntityFormLookupDto
  ): Promise<EntityFormLookupSearchResult> {
    const entityConfig = await this.operations.loadEntityConfig(entityId);
    const formConfig = entityConfig.form;
    if (!formConfig || !formConfig.sections || formConfig.sections.length === 0) {
      throw new NotFoundException(`Form is not configured for ${entityId}`);
    }

    const normalizedFieldName = fieldName.trim();
    if (!WRITE_FIELD_API_NAME_PATTERN.test(normalizedFieldName)) {
      throw new BadRequestException(`Invalid lookup field: ${fieldName}`);
    }

    const configuredField = this.operations.findConfiguredFormField(formConfig.sections, normalizedFieldName);
    if (!configuredField) {
      throw new NotFoundException(`Lookup field ${normalizedFieldName} is not configured for ${entityId}`);
    }

    const sourceDescribeMap = await this.operations.getDescribeFieldMap(entityConfig.objectApiName);
    const sourceDescribe = sourceDescribeMap.get(normalizedFieldName);
    if (!sourceDescribe) {
      throw new NotFoundException(`Lookup field ${normalizedFieldName} is not available on ${entityConfig.objectApiName}`);
    }

    const lookupMetadata = await this.operations.buildLookupMetadata(configuredField, sourceDescribe);
    if (!lookupMetadata) {
      throw new BadRequestException(`Lookup search is not supported for ${normalizedFieldName}`);
    }

    const limit = this.operations.clamp(payload.limit ?? ENTITY_FORM_LOOKUP_LIMIT, 1, ENTITY_FORM_LOOKUP_LIMIT);
    const search = payload.q?.trim();
    const context = this.operations.normalizeLookupSearchContext(payload.context);
    const items: EntityFormLookupSearchResult['items'] = [];
    const seen = new Set<string>();

    for (const targetObjectApiName of lookupMetadata.referenceTo) {
      let visibility: VisibilityEvaluation;

      try {
        visibility = await this.resourceAccessService.authorizeObjectAccess(
          user,
          `entity:${entityId}`,
          targetObjectApiName,
          {
            queryKind: ENTITY_FORM_LOOKUP_QUERY_KIND
          }
        );
      } catch (error) {
        if (error instanceof ForbiddenException) {
          continue;
        }

        throw error;
      }

      if (!this.operations.isFieldVisible(lookupMetadata.displayField, visibility)) {
        continue;
      }

      const lookupQuery = this.operations.buildLookupQueryConfig(targetObjectApiName, lookupMetadata, context);
      const scopedQuery = await this.operations.buildSoqlFromQueryConfig(lookupQuery, {
        context,
        forcedLimit: limit,
        search,
        searchConfig: search
          ? {
              fields: [lookupMetadata.searchField],
              minLength: 1
            }
          : undefined,
        visibility
      });

      const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
        contactId: user.sub,
        queryKind: ENTITY_FORM_LOOKUP_QUERY_KIND,
        targetId: `${entityId}:${normalizedFieldName}:${targetObjectApiName}`,
        objectApiName: targetObjectApiName,
        resolvedSoql: scopedQuery.soql,
        visibility,
        baseWhere: scopedQuery.baseWhere,
        finalWhere: scopedQuery.finalWhere,
        metadata: {
          entityId,
          fieldName: normalizedFieldName,
          targetObjectApiName,
          selectedFields: scopedQuery.selectFields
        }
      });
      const { records } = this.operations.extractRecords(rawQueryResult);

      for (const record of records) {
        const id = this.operations.readRecordStringValue(record, 'Id');
        const label = this.operations.readRecordStringValue(record, lookupMetadata.displayField);
        if (!id || !label) {
          continue;
        }

        const dedupeKey = `${targetObjectApiName}:${id}`;
        if (seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
        items.push({
          id,
          label,
          objectApiName: targetObjectApiName,
          subtitle:
            lookupMetadata.searchField !== lookupMetadata.displayField
              ? this.operations.readRecordStringValue(record, lookupMetadata.searchField)
              : undefined
        });

        if (items.length >= limit) {
          return { items };
        }
      }
    }

    return { items };
  }
}
