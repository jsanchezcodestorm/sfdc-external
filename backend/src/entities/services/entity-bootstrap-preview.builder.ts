import type {
  EntityConfig,
  EntityDetailConfig,
  EntityDetailSectionConfig,
  EntityFormConfig,
  EntityFormSectionConfig,
  EntityListConfig,
  EntityListViewConfig
} from '../entities.types';

import type {
  EntityAdminBootstrapPreviewResponse,
  SalesforceFieldDescribe
} from './entity-admin-config.types';
import { EntityBootstrapFieldRanker } from './entity-bootstrap-field-ranker';

interface BootstrapListPreset {
  config: EntityListConfig;
  displayFieldNames: string[];
}

const DETAIL_FORMAT_FIELD_TYPES = new Set(['date', 'datetime']);
const MAX_LIST_DISPLAY_FIELDS = 5;
const MAX_DETAIL_EXTRA_FIELDS = 6;
const MAX_DETAIL_OVERVIEW_FIELDS = 4;
const MAX_FORM_FIELDS = 12;
const MAX_FORM_SECTION_FIELDS = 6;

export class EntityBootstrapPreviewBuilder {
  private readonly fieldRanker = new EntityBootstrapFieldRanker();

  build(
    entity: EntityConfig,
    describedFields: SalesforceFieldDescribe[]
  ): EntityAdminBootstrapPreviewResponse {
    const normalizedFields = this.normalizeBootstrapFields(describedFields);
    const warnings: string[] = [
      `Al salvataggio viene auto-creata la risorsa ACL entity:${entity.id}; assegna manualmente i permessi ACL e i visibility assignments per abilitarne l uso.`
    ];
    const listPreset = this.buildListPreset(entity, normalizedFields, warnings);
    const detailPreset = this.buildDetailConfig(
      entity,
      normalizedFields,
      listPreset,
      warnings
    );
    const formPreset = this.buildFormConfig(entity, normalizedFields, warnings);

    return {
      entity: {
        ...entity,
        list: listPreset.config,
        detail: detailPreset,
        form: formPreset
      },
      warnings
    };
  }

  private normalizeBootstrapFields(fields: SalesforceFieldDescribe[]): SalesforceFieldDescribe[] {
    return fields
      .map((field) => ({
        ...field,
        name: field.name.trim(),
        label: field.label.trim()
      }))
      .filter((field) => field.name.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));
  }

  private buildListPreset(
    entity: EntityConfig,
    fields: SalesforceFieldDescribe[],
    warnings: string[]
  ): BootstrapListPreset {
    const displayFields = this.fieldRanker.rank(fields, 'list')
      .filter((field) => field.name !== 'Id')
      .slice(0, MAX_LIST_DISPLAY_FIELDS);
    const fallbackDisplayField = this.getFieldByName(fields, 'Id') ?? this.createSyntheticIdField();
    const resolvedDisplayFields =
      displayFields.length > 0 ? displayFields : fallbackDisplayField ? [fallbackDisplayField] : [];

    if (displayFields.length === 0) {
      warnings.push(
        'Preset list/detail: nessun campo business evidente, il bootstrap userà il solo Id come campo di fallback.'
      );
    }

    const searchFields = this.fieldRanker.rank(fields, 'search')
      .filter((field) => field.name !== 'Id')
      .slice(0, 3)
      .map((field) => field.name);
    if (searchFields.length === 0) {
      warnings.push(
        'Preset list: nessun campo testuale filterable disponibile per la ricerca iniziale.'
      );
    }

    const orderByField = this.selectListOrderField(resolvedDisplayFields, fields);
    const queryFields = this.uniqueValues(['Id', ...resolvedDisplayFields.map((field) => field.name)]);
    const view: EntityListViewConfig = {
      id: 'all',
      label: 'Tutti',
      default: true,
      query: {
        object: entity.objectApiName,
        fields: queryFields,
        orderBy: orderByField
          ? [
              {
                field: orderByField.field,
                direction: orderByField.direction
              }
            ]
          : undefined
      },
      columns: resolvedDisplayFields.map((field) => this.toColumn(field)),
      search:
        searchFields.length > 0
          ? {
              fields: searchFields,
              minLength: 2
            }
          : undefined,
      rowActions: [
        { type: 'link', label: 'Apri' },
        { type: 'edit', label: 'Modifica' },
        { type: 'delete', label: 'Elimina' }
      ]
    };

    return {
      config: {
        title: entity.label ?? entity.id,
        subtitle: entity.description,
        primaryAction: {
          type: 'link',
          label: 'Nuovo'
        },
        views: [view]
      },
      displayFieldNames: resolvedDisplayFields.map((field) => field.name)
    };
  }

  private buildDetailConfig(
    entity: EntityConfig,
    fields: SalesforceFieldDescribe[],
    listPreset: BootstrapListPreset,
    warnings: string[]
  ): EntityDetailConfig {
    const extraFields = this.fieldRanker.rank(fields, 'detail')
      .filter((field) => !listPreset.displayFieldNames.includes(field.name) && field.name !== 'Id')
      .slice(0, MAX_DETAIL_EXTRA_FIELDS);
    const detailFields = this.uniqueFieldOrder(
      listPreset.displayFieldNames
        .map((fieldName) => this.getFieldByName(fields, fieldName))
        .concat(extraFields)
        .filter((field): field is SalesforceFieldDescribe => Boolean(field))
    );
    if (detailFields.length === 0) {
      detailFields.push(this.getFieldByName(fields, 'Id') ?? this.createSyntheticIdField());
    }
    const overviewFields = detailFields.slice(0, MAX_DETAIL_OVERVIEW_FIELDS);
    const remainingFields = detailFields.slice(MAX_DETAIL_OVERVIEW_FIELDS);
    const sections: EntityDetailSectionConfig[] = [];

    if (overviewFields.length > 0) {
      sections.push({
        title: 'Panoramica',
        fields: overviewFields.map((field) => this.toDetailField(field))
      });
    }

    if (remainingFields.length > 0) {
      sections.push({
        title: 'Dettagli',
        fields: remainingFields.map((field) => this.toDetailField(field))
      });
    } else {
      warnings.push(
        'Preset detail: sezione "Dettagli" omessa perché non ci sono altri campi ad alto valore.'
      );
    }

    const queryFields = this.uniqueValues([
      'Id',
      this.getFieldByName(fields, 'Name') ? 'Name' : '',
      ...detailFields.map((field) => field.name)
    ]);

    return {
      query: {
        object: entity.objectApiName,
        fields: queryFields,
        where: [
          {
            field: 'Id',
            operator: '=',
            value: '{{id}}'
          }
        ],
        limit: 1
      },
      sections,
      titleTemplate: '{{Name || Id}}',
      fallbackTitle: entity.label ?? entity.id,
      actions: [
        { type: 'edit', label: 'Modifica' },
        { type: 'delete', label: 'Elimina' }
      ]
    };
  }

  private buildFormConfig(
    entity: EntityConfig,
    fields: SalesforceFieldDescribe[],
    warnings: string[]
  ): EntityFormConfig | undefined {
    const writableFields = this.fieldRanker.rank(fields, 'form')
      .filter((field) => (field.createable || field.updateable) && !this.fieldRanker.isManagedFormField(field))
      .slice(0, MAX_FORM_FIELDS);

    if (writableFields.length === 0) {
      warnings.push(
        'Preset form: nessun campo Salesforce createable/updateable disponibile, la sezione Form viene omessa.'
      );
      return undefined;
    }

    const sections = this.chunkFields(writableFields, MAX_FORM_SECTION_FIELDS).map(
      (chunk, index) => ({
        title: index === 0 ? 'Dati principali' : 'Altri campi',
        fields: chunk.map((field) => this.toFormField(field))
      })
    );

    return {
      title: {
        create: `Nuovo ${entity.label ?? entity.id}`,
        edit: `Modifica ${entity.label ?? entity.id}`
      },
      query: {
        object: entity.objectApiName,
        fields: this.uniqueValues(['Id', ...writableFields.map((field) => field.name)]),
        where: [
          {
            field: 'Id',
            operator: '=',
            value: '{{id}}'
          }
        ],
        limit: 1
      },
      subtitle: entity.description,
      sections
    };
  }

  private selectListOrderField(
    displayFields: SalesforceFieldDescribe[],
    allFields: SalesforceFieldDescribe[]
  ): { field: string; direction: 'ASC' | 'DESC' } | undefined {
    if (displayFields.some((field) => field.name === 'Name')) {
      return {
        field: 'Name',
        direction: 'ASC'
      };
    }

    if (this.getFieldByName(allFields, 'CreatedDate')) {
      return {
        field: 'CreatedDate',
        direction: 'DESC'
      };
    }

    if (this.getFieldByName(allFields, 'LastModifiedDate')) {
      return {
        field: 'LastModifiedDate',
        direction: 'DESC'
      };
    }

    const firstField = displayFields[0];
    if (!firstField || firstField.name === 'Id') {
      return undefined;
    }

    return {
      field: firstField.name,
      direction: 'ASC'
    };
  }

  private getFieldByName(
    fields: SalesforceFieldDescribe[],
    fieldName: string
  ): SalesforceFieldDescribe | undefined {
    return fields.find((field) => field.name === fieldName);
  }

  private createSyntheticIdField(): SalesforceFieldDescribe {
    return {
      name: 'Id',
      label: 'Record ID',
      type: 'id',
      nillable: false,
      createable: false,
      updateable: false,
      filterable: true
    };
  }

  private uniqueValues(values: string[]): string[] {
    return [...new Set(values.filter((value) => value.trim().length > 0))];
  }

  private uniqueFieldOrder(fields: SalesforceFieldDescribe[]): SalesforceFieldDescribe[] {
    const seen = new Set<string>();
    return fields.filter((field) => {
      if (seen.has(field.name)) {
        return false;
      }

      seen.add(field.name);
      return true;
    });
  }

  private toColumn(field: SalesforceFieldDescribe): EntityListViewConfig['columns'][number] {
    return {
      field: field.name,
      label: field.label || field.name
    };
  }

  private toDetailField(
    field: SalesforceFieldDescribe
  ): EntityDetailSectionConfig['fields'][number] {
    return {
      field: field.name,
      label: field.label || field.name,
      format: DETAIL_FORMAT_FIELD_TYPES.has(field.type.toLowerCase())
        ? (field.type.toLowerCase() as 'date' | 'datetime')
        : undefined
    };
  }

  private toFormField(
    field: SalesforceFieldDescribe
  ): NonNullable<EntityFormSectionConfig['fields']>[number] {
    return {
      field: field.name
    };
  }

  private chunkFields<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }
}
