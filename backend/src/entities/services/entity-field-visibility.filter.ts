import { ForbiddenException } from '@nestjs/common';

import type { EntityColumnConfig, EntityConfig } from '../entities.types';
import type {
  EntityFormSectionResponse,
  FieldVisibilityApplier,
  VisibilityEvaluation
} from '../entities.runtime.types';

import { uniqueValues } from './entity-runtime-utils';

export class EntityFieldVisibilityFilter {
  constructor(private readonly applyFieldVisibility: FieldVisibilityApplier) {}

  collectDetailFieldNames(entityConfig: EntityConfig, queryFields: string[] = []): string[] {
    const sectionFields = (entityConfig.detail?.sections ?? [])
      .flatMap((section) => section.fields ?? [])
      .map((fieldConfig) => fieldConfig.field)
      .filter((fieldName): fieldName is string => typeof fieldName === 'string' && fieldName.trim().length > 0);

    return uniqueValues(['Id', ...queryFields, ...sectionFields]);
  }

  extractColumnFieldPaths(columns: Array<string | { field?: unknown }>): string[] {
    const fieldPaths = columns
      .map((column) => {
        if (typeof column === 'string') {
          return column.trim();
        }

        const field = column.field;
        return typeof field === 'string' ? field.trim() : '';
      })
      .filter((fieldPath) => fieldPath.length > 0);

    return uniqueValues(fieldPaths);
  }

  filterVisibleColumns(
    columns: Array<string | EntityColumnConfig>,
    visibility: VisibilityEvaluation
  ): Array<string | EntityColumnConfig> {
    return columns.filter((column) => {
      if (typeof column === 'string') {
        return this.isFieldVisible(column, visibility);
      }

      if (typeof column.field !== 'string' || column.field.trim().length === 0) {
        return true;
      }

      return this.isFieldVisible(column.field, visibility);
    });
  }

  filterVisibleDetailSections(
    sections: NonNullable<NonNullable<EntityConfig['detail']>['sections']>,
    visibility: VisibilityEvaluation
  ): NonNullable<NonNullable<EntityConfig['detail']>['sections']> {
    return sections
      .map((section) => ({
        ...section,
        fields: (section.fields ?? []).filter((fieldConfig) =>
          typeof fieldConfig.field === 'string'
            ? this.isFieldVisible(fieldConfig.field, visibility)
            : false
        )
      }))
      .filter((section) => (section.fields ?? []).length > 0);
  }

  collectFormFieldNames(sections: EntityFormSectionResponse[]): string[] {
    return uniqueValues(
      sections.flatMap((section) => section.fields.map((field) => field.field)).filter((field) => field.length > 0)
    );
  }

  isFieldVisible(fieldPath: string, visibility: VisibilityEvaluation): boolean {
    return this.applyFieldVisibility([fieldPath], visibility).length > 0;
  }

  ensureVisibleFields(
    fields: string[],
    visibility: VisibilityEvaluation,
    message: string
  ): void {
    if (this.applyFieldVisibility(fields, visibility).length === 0) {
      throw new ForbiddenException(message);
    }
  }
}
