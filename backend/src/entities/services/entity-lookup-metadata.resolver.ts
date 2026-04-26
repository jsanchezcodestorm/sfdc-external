import type { EntityFormFieldConfig, EntityQueryConfig, EntityQueryWhere } from '../entities.types';
import {
  ENTITY_FORM_LOOKUP_LIMIT,
  WRITE_FIELD_API_NAME_PATTERN,
  type DescribeFieldMapLoader,
  type EntityFieldLookupMetadata,
  type LookupSearchContext,
  type ResolvedLookupMetadata,
  type SalesforceFieldSummary
} from '../entities.runtime.types';

import { normalizeLookupConditionOperator, renderTemplate, uniqueValues } from './entity-runtime-utils';

export class EntityLookupMetadataResolver {
  constructor(private readonly getDescribeFieldMap: DescribeFieldMapLoader) {}

  async resolveLookupProjectionFields(objectApiName: string, fieldPaths: string[]): Promise<string[]> {
    if (fieldPaths.length === 0) {
      return [];
    }

    const sourceDescribeMap = await this.getDescribeFieldMap(objectApiName);
    const projections: string[] = [];

    for (const fieldPath of fieldPaths) {
      const fieldName = fieldPath.trim();
      if (!fieldName || fieldName.includes('.')) {
        continue;
      }

      const describe = sourceDescribeMap.get(fieldName);
      if (!describe || describe.type.toLowerCase() !== 'reference') {
        continue;
      }

      const relationshipName = describe.relationshipName?.trim() ?? '';
      const referenceTargets = (describe.referenceTo ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      if (!relationshipName || referenceTargets.length === 0) {
        continue;
      }

      const displayField = await this.resolveLookupDisplayFieldAcrossTargets(referenceTargets);
      if (!displayField) {
        continue;
      }

      projections.push(`${relationshipName}.${displayField}`);
    }

    return uniqueValues(projections);
  }

  async resolveLookupDisplayFieldAcrossTargets(targetObjectApiNames: string[]): Promise<string | null> {
    if (targetObjectApiNames.length === 0) {
      return null;
    }

    const candidateSets: Array<Set<string>> = [];

    for (const targetObjectApiName of targetObjectApiNames) {
      try {
        const describeMap = await this.getDescribeFieldMap(targetObjectApiName);
        const candidates = this.resolveLookupDisplayFieldCandidates(describeMap);
        if (candidates.length === 0) {
          return null;
        }

        candidateSets.push(new Set(candidates));
      } catch {
        return null;
      }
    }

    for (const candidate of this.lookupDisplayFieldPriority()) {
      if (candidateSets.every((candidateSet) => candidateSet.has(candidate))) {
        return candidate;
      }
    }

    return null;
  }

  resolveLookupDisplayFieldCandidates(describeMap: Map<string, SalesforceFieldSummary>): string[] {
    const candidates: string[] = [];
    for (const candidate of this.lookupDisplayFieldPriority()) {
      if (describeMap.has(candidate)) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  lookupDisplayFieldPriority(): string[] {
    return ['Name', 'CaseNumber', 'Subject', 'Title'];
  }

  buildLookupQueryConfig(
    objectApiName: string,
    lookup: ResolvedLookupMetadata,
    context: LookupSearchContext
  ): EntityQueryConfig {
    return {
      object: objectApiName,
      fields: uniqueValues([
        'Id',
        lookup.displayField,
        ...(lookup.searchField !== lookup.displayField ? [lookup.searchField] : [])
      ]),
      where: this.resolveLookupQueryConditions(lookup.where ?? [], context),
      orderBy:
        lookup.orderBy && lookup.orderBy.length > 0
          ? lookup.orderBy
          : [
              {
                field: lookup.displayField,
                direction: 'ASC'
              }
            ],
      limit: ENTITY_FORM_LOOKUP_LIMIT
    };
  }

  resolveLookupQueryConditions(
    conditions: Array<{ field?: string; operator?: string; value?: string | number | boolean | null; parentRel?: string }>,
    context: LookupSearchContext
  ): EntityQueryWhere[] {
    const resolved: EntityQueryWhere[] = [];
    const contextParentRel = String(context.parentRel ?? '').trim();

    for (const condition of conditions) {
      const conditionParentRel = condition.parentRel?.trim();
      if (conditionParentRel && conditionParentRel !== contextParentRel) {
        continue;
      }

      const normalizedField = condition.field?.trim();
      if (!normalizedField) {
        continue;
      }

      if (normalizedField.toLowerCase() === 'parentrel') {
        const expectedParentRel =
          typeof condition.value === 'string'
            ? renderTemplate(condition.value, context).trim()
            : String(condition.value ?? '').trim();
        if (!expectedParentRel || expectedParentRel !== contextParentRel) {
          continue;
        }

        continue;
      }

      let resolvedValue = condition.value;
      if (typeof condition.value === 'string') {
        const hasTemplate = /\{\{[^}]+\}\}/.test(condition.value);
        const rendered = renderTemplate(condition.value, context).trim();
        if (hasTemplate && rendered.length === 0) {
          continue;
        }

        resolvedValue = rendered;
      }

      resolved.push({
        field: normalizedField,
        operator: normalizeLookupConditionOperator(condition.operator),
        value: resolvedValue ?? null
      });
    }

    return resolved;
  }

  async buildLookupMetadata(
    fieldConfig: EntityFormFieldConfig,
    describe: SalesforceFieldSummary
  ): Promise<ResolvedLookupMetadata | null> {
    if (describe.type.toLowerCase() !== 'reference') {
      return null;
    }

    const relationshipName = describe.relationshipName?.trim() ?? '';
    const referenceTargets = (describe.referenceTo ?? [])
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (!relationshipName || referenceTargets.length === 0) {
      return null;
    }

    const displayField = await this.resolveLookupDisplayFieldAcrossTargets(referenceTargets);
    if (!displayField) {
      return null;
    }

    const searchField = await this.resolveLookupSearchFieldAcrossTargets(
      fieldConfig.lookup?.searchField,
      displayField,
      referenceTargets
    );

    return {
      referenceTo: referenceTargets,
      searchField,
      where: fieldConfig.lookup?.where,
      orderBy: fieldConfig.lookup?.orderBy,
      prefill: fieldConfig.lookup?.prefill,
      displayField,
      relationshipName
    };
  }

  async resolveLookupSearchFieldAcrossTargets(
    requestedFieldName: string | undefined,
    fallbackFieldName: string,
    targetObjectApiNames: string[]
  ): Promise<string> {
    const normalizedRequestedFieldName = requestedFieldName?.trim();
    if (
      normalizedRequestedFieldName &&
      await this.isLookupSearchFieldSupportedAcrossTargets(
        normalizedRequestedFieldName,
        targetObjectApiNames
      )
    ) {
      return normalizedRequestedFieldName;
    }

    return fallbackFieldName;
  }

  async isLookupSearchFieldSupportedAcrossTargets(
    fieldName: string,
    targetObjectApiNames: string[]
  ): Promise<boolean> {
    if (!WRITE_FIELD_API_NAME_PATTERN.test(fieldName)) {
      return false;
    }

    for (const targetObjectApiName of targetObjectApiNames) {
      const describeMap = await this.getDescribeFieldMap(targetObjectApiName);
      const fieldDescribe = describeMap.get(fieldName);
      if (!fieldDescribe || !fieldDescribe.filterable) {
        return false;
      }
    }

    return true;
  }

  toPublicLookupMetadata(lookup: ResolvedLookupMetadata): EntityFieldLookupMetadata {
    return {
      referenceTo: lookup.referenceTo,
      searchField: lookup.searchField,
      where: lookup.where,
      orderBy: lookup.orderBy,
      prefill: lookup.prefill
    };
  }
}
