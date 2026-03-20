import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { SessionUser } from '../../auth/session-user.interface';
import { SalesforceService, type SalesforceRecordTypeSummary } from '../../salesforce/salesforce.service';
import type { EntityConfig, EntityLayoutAssignmentConfig, EntityLayoutConfig } from '../entities.types';

type EntityLayoutCapability = 'detail' | 'form';

export interface ResolvedEntityLayout {
  layout: EntityLayoutConfig;
  layoutId: string;
  recordTypeDeveloperName?: string;
}

export interface EntityCreateLayoutOptions {
  items: Array<{
    recordTypeDeveloperName: string;
    label: string;
    layoutId: string;
  }>;
  recordTypeSelectionRequired: boolean;
}

@Injectable()
export class EntityLayoutResolverService {
  private readonly logger = new Logger(EntityLayoutResolverService.name);

  constructor(private readonly salesforceService: SalesforceService) {}

  async resolveRecordTypeDeveloperName(entityConfig: EntityConfig, recordId: string): Promise<string | undefined> {
    const escapedRecordId = recordId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escapedObjectApiName = this.toSoqlIdentifier(entityConfig.objectApiName);
    let result: { records?: Array<Record<string, unknown>> };

    try {
      result = (await this.salesforceService.executeReadOnlyQuery(
        [
          'SELECT Id, RecordType.DeveloperName',
          `FROM ${escapedObjectApiName}`,
          `WHERE Id = '${escapedRecordId}'`,
          'LIMIT 1'
        ].join(' ')
      )) as { records?: Array<Record<string, unknown>> };
    } catch (error) {
      this.logger.warn(
        `Failed to resolve record type for ${entityConfig.id}/${recordId}; continuing without record type-specific layout resolution: ${this.normalizeErrorMessage(error)}`
      );
      return undefined;
    }

    const record = Array.isArray(result.records) ? result.records[0] : undefined;
    if (!record) {
      throw new NotFoundException(`Record ${recordId} not found`);
    }

    const recordType = record.RecordType;
    if (this.isObjectRecord(recordType) && typeof recordType.DeveloperName === 'string') {
      const developerName = recordType.DeveloperName.trim();
      return developerName.length > 0 ? developerName : undefined;
    }

    return undefined;
  }

  resolveLayout(
    entityConfig: EntityConfig,
    user: SessionUser,
    capability: EntityLayoutCapability,
    recordTypeDeveloperName?: string
  ): ResolvedEntityLayout {
    const layouts = entityConfig.layouts.filter((layout) =>
      capability === 'detail' ? Boolean(layout.detail) : Boolean(layout.form)
    );
    if (layouts.length === 0) {
      throw new NotFoundException(
        `${capability === 'detail' ? 'Detail' : 'Form'} layout is not configured for ${entityConfig.id}`
      );
    }

    const userPermissions = new Set(
      Array.isArray(user.permissions)
        ? user.permissions.map((permission) => String(permission).trim()).filter((permission) => permission.length > 0)
        : []
    );
    const matches: Array<{ layout: EntityLayoutConfig; assignment: EntityLayoutAssignmentConfig; specificity: number; priority: number }> = [];

    for (const layout of layouts) {
      for (const assignment of layout.assignments) {
        const match = this.matchAssignment(assignment, userPermissions, recordTypeDeveloperName);
        if (match) {
          matches.push({
            layout,
            assignment,
            specificity: match.specificity,
            priority: assignment.priority ?? 0
          });
        }
      }
    }

    if (matches.length > 0) {
      matches.sort((left, right) => {
        if (right.specificity !== left.specificity) {
          return right.specificity - left.specificity;
        }

        return right.priority - left.priority;
      });

      const winner = matches[0];
      const ambiguous = matches.filter(
        (entry) =>
          entry.layout.id !== winner.layout.id &&
          entry.specificity === winner.specificity &&
          entry.priority === winner.priority
      );
      if (ambiguous.length > 0) {
        throw new BadRequestException(
          `Entity layout selection is ambiguous for ${entityConfig.id} (${capability})`
        );
      }

      return {
        layout: winner.layout,
        layoutId: winner.layout.id,
        recordTypeDeveloperName
      };
    }

    const hasExplicitRecordTypeAssignments =
      typeof recordTypeDeveloperName === 'string' &&
      recordTypeDeveloperName.trim().length > 0 &&
      layouts.some((layout) =>
        layout.assignments.some(
          (assignment) => assignment.recordTypeDeveloperName === recordTypeDeveloperName
        )
      );

    if (hasExplicitRecordTypeAssignments) {
      throw new NotFoundException(
        `No applicable ${capability} layout configured for ${entityConfig.id}`
      );
    }

    const defaultLayouts = layouts.filter((layout) => layout.isDefault);
    if (defaultLayouts.length === 1) {
      return {
        layout: defaultLayouts[0],
        layoutId: defaultLayouts[0].id,
        recordTypeDeveloperName
      };
    }

    throw new NotFoundException(
      `No applicable ${capability} layout configured for ${entityConfig.id}`
    );
  }

  async listCreateOptions(entityConfig: EntityConfig, user: SessionUser): Promise<EntityCreateLayoutOptions> {
    const recordTypes = await this.salesforceService.describeRecordTypes(entityConfig.objectApiName);
    const selectableRecordTypes = this
      .filterCreateRecordTypes(recordTypes)
      .filter((recordType) => !recordType.master);

    if (selectableRecordTypes.length === 0) {
      return {
        items: [],
        recordTypeSelectionRequired: false,
      };
    }

    const options: EntityCreateLayoutOptions['items'] = [];

    for (const recordType of selectableRecordTypes) {
      try {
        const resolved = this.resolveLayout(entityConfig, user, 'form', recordType.developerName);
        options.push({
          recordTypeDeveloperName: recordType.developerName,
          label: recordType.label || recordType.developerName,
          layoutId: resolved.layoutId
        });
      } catch (error) {
        if (error instanceof NotFoundException) {
          continue;
        }

        throw error;
      }
    }

    return {
      items: options.sort((left, right) => {
        if (left.label !== right.label) {
          return left.label.localeCompare(right.label, 'en', { sensitivity: 'base' });
        }

        return left.recordTypeDeveloperName.localeCompare(right.recordTypeDeveloperName, 'en', {
          sensitivity: 'base'
        });
      }),
      recordTypeSelectionRequired: true,
    };
  }

  private filterCreateRecordTypes(recordTypes: SalesforceRecordTypeSummary[]): SalesforceRecordTypeSummary[] {
    const filtered = recordTypes.filter((recordType) => recordType.active && recordType.available);
    return filtered.length > 0 ? filtered : recordTypes.filter((recordType) => recordType.active);
  }

  private matchAssignment(
    assignment: EntityLayoutAssignmentConfig,
    userPermissions: Set<string>,
    recordTypeDeveloperName?: string
  ): { specificity: number } | null {
    const matchesRecordType = Boolean(assignment.recordTypeDeveloperName);
    const matchesPermission = Boolean(assignment.permissionCode);

    if (
      assignment.recordTypeDeveloperName &&
      assignment.recordTypeDeveloperName !== recordTypeDeveloperName
    ) {
      return null;
    }

    if (assignment.permissionCode && !userPermissions.has(assignment.permissionCode)) {
      return null;
    }

    return {
      specificity: (matchesRecordType ? 2 : 0) + (matchesPermission ? 1 : 0)
    };
  }

  private toSoqlIdentifier(identifier: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(identifier)) {
      throw new BadRequestException(`Invalid SOQL identifier: ${identifier}`);
    }

    return identifier;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return 'unknown error';
  }
}
