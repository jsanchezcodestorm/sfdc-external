import type { EntityFormFieldConfig, EntityFormSectionConfig } from '../entities.types';
import {
  NUMERIC_SEARCH_TYPES,
  SYSTEM_MANAGED_FIELD_NAMES,
  WRITE_FIELD_API_NAME_PATTERN,
  type DescribeFieldMapLoader,
  type EntityFieldDefinition,
  type EntityFieldOption,
  type EntityFormSectionResponse,
  type SalesforceFieldSummary,
  type SalesforcePicklistValueSummary,
  type WriteMode
} from '../entities.runtime.types';

import { toFieldLabel, uniqueValues } from './entity-runtime-utils';
import type { EntityLookupMetadataResolver } from './entity-lookup-metadata.resolver';

export class EntityFormFieldResolver {
  constructor(
    private readonly getDescribeFieldMap: DescribeFieldMapLoader,
    private readonly lookupResolver: EntityLookupMetadataResolver
  ) {}

  async resolveFormSections(
    formSections: EntityFormSectionConfig[],
    objectApiName: string,
    mode: WriteMode
  ): Promise<EntityFormSectionResponse[]> {
    const describeMap = await this.getDescribeFieldMap(objectApiName);
    const sections: EntityFormSectionResponse[] = [];

    for (const [index, section] of formSections.entries()) {
      const fields: EntityFormSectionResponse['fields'] = [];

      for (const fieldConfig of section.fields ?? []) {
        const field = await this.resolveFormField(fieldConfig, describeMap, mode);
        if (field) {
          fields.push(field);
        }
      }

      if (fields.length === 0) {
        continue;
      }

      const sectionTitle = section.title && section.title.trim().length > 0 ? section.title : `Section ${index + 1}`;
      sections.push({
        title: sectionTitle,
        fields
      });
    }

    return sections;
  }

  async resolveFormField(
    fieldConfig: EntityFormFieldConfig,
    describeMap: Map<string, SalesforceFieldSummary>,
    mode: WriteMode
  ): Promise<EntityFormSectionResponse['fields'][number] | null> {
    const fieldName = fieldConfig.field?.trim() ?? '';
    if (!fieldName || !WRITE_FIELD_API_NAME_PATTERN.test(fieldName)) {
      return null;
    }

    const describe = describeMap.get(fieldName);
    if (!describe || this.shouldExcludeFormField(fieldName, describe, mode)) {
      return null;
    }

    const lookup = await this.lookupResolver.buildLookupMetadata(fieldConfig, describe);

    return {
      field: fieldName,
      label: describe.label || toFieldLabel(fieldName),
      inputType: this.mapRuntimeFormInputType(describe.type),
      required: this.isRequiredFieldForMode(describe, mode),
      placeholder: fieldConfig.placeholder,
      options: this.toFieldOptions(describe.picklistValues),
      lookup: lookup ? this.lookupResolver.toPublicLookupMetadata(lookup) : undefined
    };
  }

  async buildFieldDefinitions(objectApiName: string, fields: string[]): Promise<EntityFieldDefinition[]> {
    const describeMap = await this.getDescribeFieldMap(objectApiName);
    const normalizedFields = uniqueValues(fields).filter((field) => field.length > 0);

    return normalizedFields.map((fieldName) => {
      const describe = describeMap.get(fieldName);
      const type = describe?.type ?? 'string';

      return {
        field: fieldName,
        label: describe?.label ?? toFieldLabel(fieldName),
        type,
        nillable: describe?.nillable ?? true,
        createable: describe?.createable ?? false,
        updateable: describe?.updateable ?? false,
        filterable: describe?.filterable ?? false,
        inputType: this.mapRuntimeFormInputType(type),
        required: describe ? !describe.nillable : false,
        options: this.toFieldOptions(describe?.picklistValues)
      };
    });
  }

  async buildFormFieldDefinitions(
    objectApiName: string,
    configuredSections: EntityFormSectionConfig[],
    fields: string[],
    mode: WriteMode
  ): Promise<EntityFieldDefinition[]> {
    const describeMap = await this.getDescribeFieldMap(objectApiName);
    const fieldConfigMap = this.buildConfiguredFormFieldMap(configuredSections);
    const normalizedFields = uniqueValues(fields).filter((field) => field.length > 0);
    const definitions: EntityFieldDefinition[] = [];

    for (const fieldName of normalizedFields) {
      const describe = describeMap.get(fieldName);
      if (!describe) {
        continue;
      }

      const fieldConfig = fieldConfigMap.get(fieldName);
      const lookup = fieldConfig ? await this.lookupResolver.buildLookupMetadata(fieldConfig, describe) : null;

      definitions.push({
        field: fieldName,
        label: describe.label || toFieldLabel(fieldName),
        type: describe.type,
        nillable: describe.nillable,
        createable: describe.createable,
        updateable: describe.updateable,
        filterable: describe.filterable,
        inputType: this.mapRuntimeFormInputType(describe.type),
        required: this.isRequiredFieldForMode(describe, mode),
        options: this.toFieldOptions(describe.picklistValues),
        lookup: lookup ? this.lookupResolver.toPublicLookupMetadata(lookup) : undefined
      });
    }

    return definitions;
  }

  findConfiguredFormField(
    sections: Array<{ fields?: EntityFormFieldConfig[] }>,
    fieldName: string
  ): EntityFormFieldConfig | null {
    for (const section of sections) {
      for (const field of section.fields ?? []) {
        if (field.field?.trim() === fieldName) {
          return field;
        }
      }
    }

    return null;
  }

  toFieldOptions(
    picklistValues: SalesforcePicklistValueSummary[] | undefined
  ): EntityFieldOption[] | undefined {
    if (!Array.isArray(picklistValues) || picklistValues.length === 0) {
      return undefined;
    }

    const options = picklistValues
      .map((entry) => ({
        value: entry.value.trim(),
        label: entry.label.trim() || entry.value.trim(),
        default: entry.defaultValue ? true : undefined
      }))
      .filter((entry) => entry.value.length > 0);

    return options.length > 0 ? options : undefined;
  }

  isRequiredFieldForMode(describe: SalesforceFieldSummary, mode: WriteMode): boolean {
    if (mode === 'create') {
      return (
        describe.createable &&
        !describe.nillable &&
        !describe.defaultedOnCreate &&
        !describe.calculated &&
        !describe.autoNumber
      );
    }

    return describe.updateable && !describe.nillable && !describe.calculated && !describe.autoNumber;
  }

  isWritableFieldInMode(describe: SalesforceFieldSummary, mode: WriteMode): boolean {
    return mode === 'create' ? describe.createable : describe.updateable;
  }

  shouldExcludeFormField(
    fieldName: string,
    describe: SalesforceFieldSummary,
    mode: WriteMode
  ): boolean {
    if (!WRITE_FIELD_API_NAME_PATTERN.test(fieldName)) {
      return true;
    }

    return (
      this.isSystemManagedFieldName(fieldName) ||
      describe.calculated ||
      describe.autoNumber ||
      !this.isWritableFieldInMode(describe, mode)
    );
  }

  isSystemManagedFieldName(fieldName: string): boolean {
    return SYSTEM_MANAGED_FIELD_NAMES.has(fieldName.trim().toLowerCase());
  }

  mapRuntimeFormInputType(salesforceType: string): EntityFormSectionResponse['fields'][number]['inputType'] {
    const normalizedType = salesforceType.toLowerCase();

    if (normalizedType === 'email') {
      return 'email';
    }

    if (normalizedType === 'phone') {
      return 'tel';
    }

    if (normalizedType === 'date') {
      return 'date';
    }

    if (normalizedType === 'textarea' || normalizedType === 'longtextarea' || normalizedType === 'richtextarea') {
      return 'textarea';
    }

    if (NUMERIC_SEARCH_TYPES.has(normalizedType)) {
      return 'number';
    }

    if (normalizedType === 'boolean') {
      return 'checkbox';
    }

    if (normalizedType === 'picklist') {
      return 'select';
    }

    if (normalizedType === 'multipicklist') {
      return 'multiselect';
    }

    if (normalizedType === 'reference') {
      return 'lookup';
    }

    return 'text';
  }

  buildConfiguredFormFieldMap(
    sections: Array<{ fields?: EntityFormFieldConfig[] }>
  ): Map<string, EntityFormFieldConfig> {
    const fieldConfigMap = new Map<string, EntityFormFieldConfig>();

    for (const section of sections) {
      for (const fieldConfig of section.fields ?? []) {
        const fieldName = fieldConfig.field?.trim() ?? '';
        if (!fieldName || fieldConfigMap.has(fieldName)) {
          continue;
        }

        fieldConfigMap.set(fieldName, fieldConfig);
      }
    }

    return fieldConfigMap;
  }
}
