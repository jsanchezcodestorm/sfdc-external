import type {
  EntityFormFieldConfig,
  EntityFormSectionConfig,
  EntityQueryConfig,
  EntityQueryWhere
} from '../entities.types';
import type {
  DescribeFieldMapLoader,
  EntityFieldDefinition,
  EntityFieldLookupMetadata,
  EntityFieldOption,
  EntityFormSectionResponse,
  LookupSearchContext,
  ResolvedLookupMetadata,
  SalesforceFieldSummary,
  SalesforcePicklistValueSummary,
  WriteMode
} from '../entities.runtime.types';

import { EntityFormFieldResolver } from './entity-form-field.resolver';
import { EntityLookupMetadataResolver } from './entity-lookup-metadata.resolver';

export class EntityFieldMetadataResolver {
  private readonly formFieldResolver: EntityFormFieldResolver;
  private readonly lookupResolver: EntityLookupMetadataResolver;

  constructor(getDescribeFieldMap: DescribeFieldMapLoader) {
    this.lookupResolver = new EntityLookupMetadataResolver(getDescribeFieldMap);
    this.formFieldResolver = new EntityFormFieldResolver(getDescribeFieldMap, this.lookupResolver);
  }

  resolveLookupProjectionFields(objectApiName: string, fieldPaths: string[]): Promise<string[]> {
    return this.lookupResolver.resolveLookupProjectionFields(objectApiName, fieldPaths);
  }

  resolveLookupDisplayFieldAcrossTargets(targetObjectApiNames: string[]): Promise<string | null> {
    return this.lookupResolver.resolveLookupDisplayFieldAcrossTargets(targetObjectApiNames);
  }

  resolveLookupDisplayFieldCandidates(describeMap: Map<string, SalesforceFieldSummary>): string[] {
    return this.lookupResolver.resolveLookupDisplayFieldCandidates(describeMap);
  }

  lookupDisplayFieldPriority(): string[] {
    return this.lookupResolver.lookupDisplayFieldPriority();
  }

  resolveFormSections(
    formSections: EntityFormSectionConfig[],
    objectApiName: string,
    mode: WriteMode
  ): Promise<EntityFormSectionResponse[]> {
    return this.formFieldResolver.resolveFormSections(formSections, objectApiName, mode);
  }

  resolveFormField(
    fieldConfig: EntityFormFieldConfig,
    describeMap: Map<string, SalesforceFieldSummary>,
    mode: WriteMode
  ): Promise<EntityFormSectionResponse['fields'][number] | null> {
    return this.formFieldResolver.resolveFormField(fieldConfig, describeMap, mode);
  }

  buildFieldDefinitions(objectApiName: string, fields: string[]): Promise<EntityFieldDefinition[]> {
    return this.formFieldResolver.buildFieldDefinitions(objectApiName, fields);
  }

  buildFormFieldDefinitions(
    objectApiName: string,
    configuredSections: EntityFormSectionConfig[],
    fields: string[],
    mode: WriteMode
  ): Promise<EntityFieldDefinition[]> {
    return this.formFieldResolver.buildFormFieldDefinitions(objectApiName, configuredSections, fields, mode);
  }

  findConfiguredFormField(
    sections: Array<{ fields?: EntityFormFieldConfig[] }>,
    fieldName: string
  ): EntityFormFieldConfig | null {
    return this.formFieldResolver.findConfiguredFormField(sections, fieldName);
  }

  buildLookupQueryConfig(
    objectApiName: string,
    lookup: ResolvedLookupMetadata,
    context: LookupSearchContext
  ): EntityQueryConfig {
    return this.lookupResolver.buildLookupQueryConfig(objectApiName, lookup, context);
  }

  resolveLookupQueryConditions(
    conditions: Array<{ field?: string; operator?: string; value?: string | number | boolean | null; parentRel?: string }>,
    context: LookupSearchContext
  ): EntityQueryWhere[] {
    return this.lookupResolver.resolveLookupQueryConditions(conditions, context);
  }

  buildLookupMetadata(
    fieldConfig: EntityFormFieldConfig,
    describe: SalesforceFieldSummary
  ): Promise<ResolvedLookupMetadata | null> {
    return this.lookupResolver.buildLookupMetadata(fieldConfig, describe);
  }

  resolveLookupSearchFieldAcrossTargets(
    requestedFieldName: string | undefined,
    fallbackFieldName: string,
    targetObjectApiNames: string[]
  ): Promise<string> {
    return this.lookupResolver.resolveLookupSearchFieldAcrossTargets(
      requestedFieldName,
      fallbackFieldName,
      targetObjectApiNames
    );
  }

  isLookupSearchFieldSupportedAcrossTargets(
    fieldName: string,
    targetObjectApiNames: string[]
  ): Promise<boolean> {
    return this.lookupResolver.isLookupSearchFieldSupportedAcrossTargets(fieldName, targetObjectApiNames);
  }

  toPublicLookupMetadata(lookup: ResolvedLookupMetadata): EntityFieldLookupMetadata {
    return this.lookupResolver.toPublicLookupMetadata(lookup);
  }

  toFieldOptions(
    picklistValues: SalesforcePicklistValueSummary[] | undefined
  ): EntityFieldOption[] | undefined {
    return this.formFieldResolver.toFieldOptions(picklistValues);
  }

  isRequiredFieldForMode(describe: SalesforceFieldSummary, mode: WriteMode): boolean {
    return this.formFieldResolver.isRequiredFieldForMode(describe, mode);
  }

  isWritableFieldInMode(describe: SalesforceFieldSummary, mode: WriteMode): boolean {
    return this.formFieldResolver.isWritableFieldInMode(describe, mode);
  }

  shouldExcludeFormField(
    fieldName: string,
    describe: SalesforceFieldSummary,
    mode: WriteMode
  ): boolean {
    return this.formFieldResolver.shouldExcludeFormField(fieldName, describe, mode);
  }

  isSystemManagedFieldName(fieldName: string): boolean {
    return this.formFieldResolver.isSystemManagedFieldName(fieldName);
  }

  mapRuntimeFormInputType(salesforceType: string): EntityFormSectionResponse['fields'][number]['inputType'] {
    return this.formFieldResolver.mapRuntimeFormInputType(salesforceType);
  }

  buildConfiguredFormFieldMap(
    sections: Array<{ fields?: EntityFormFieldConfig[] }>
  ): Map<string, EntityFormFieldConfig> {
    return this.formFieldResolver.buildConfiguredFormFieldMap(sections);
  }
}
