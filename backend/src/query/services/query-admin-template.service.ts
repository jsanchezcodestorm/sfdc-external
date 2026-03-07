import { BadRequestException, Injectable } from '@nestjs/common';

import { AclService } from '../../acl/acl.service';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import type { QueryTemplate } from '../query.types';

import {
  QueryAdminTemplateRepository,
  type QueryTemplateAdminSummary
} from './query-admin-template.repository';
import { QueryTemplateRepository } from './query-template.repository';

export interface QueryTemplateAdminSummaryResponse extends QueryTemplateAdminSummary {
  aclResourceConfigured: boolean;
}

export interface QueryTemplateAdminListResponse {
  items: QueryTemplateAdminSummaryResponse[];
}

export interface QueryTemplateAdminResponse {
  template: QueryTemplate;
  aclResourceConfigured: boolean;
}

@Injectable()
export class QueryAdminTemplateService {
  constructor(
    private readonly resourceAccessService: ResourceAccessService,
    private readonly queryAdminTemplateRepository: QueryAdminTemplateRepository,
    private readonly queryTemplateRepository: QueryTemplateRepository,
    private readonly aclService: AclService
  ) {}

  async listTemplates(): Promise<QueryTemplateAdminListResponse> {
    const items = await this.queryAdminTemplateRepository.listSummaries();

    return {
      items: items.map((item) => ({
        ...item,
        aclResourceConfigured: this.aclService.hasResource(`query:${item.id}`)
      }))
    };
  }

  async getTemplate(templateId: string): Promise<QueryTemplateAdminResponse> {
    this.resourceAccessService.assertKebabCaseId(templateId, 'templateId');
    const template = await this.queryAdminTemplateRepository.getTemplate(templateId);

    return {
      template,
      aclResourceConfigured: this.aclService.hasResource(`query:${templateId}`)
    };
  }

  async upsertTemplate(templateId: string, payload: unknown): Promise<QueryTemplateAdminResponse> {
    this.resourceAccessService.assertKebabCaseId(templateId, 'templateId');
    const template = this.normalizeTemplate(payload);

    if (template.id !== templateId) {
      throw new BadRequestException('template.id must match route templateId');
    }

    await this.queryAdminTemplateRepository.upsertTemplate(template);
    this.queryTemplateRepository.evictTemplate(templateId);

    return this.getTemplate(templateId);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    this.resourceAccessService.assertKebabCaseId(templateId, 'templateId');
    await this.queryAdminTemplateRepository.deleteTemplate(templateId);
    this.queryTemplateRepository.evictTemplate(templateId);
  }

  private normalizeTemplate(value: unknown): QueryTemplate {
    const template = this.requireObject(value, 'Query template payload must be an object');
    const id = this.requireString(template.id, 'template.id is required');
    const objectApiName = this.requireString(template.objectApiName, 'template.objectApiName is required');
    const soql = this.requireString(template.soql, 'template.soql is required');
    const defaultParams = this.normalizeDefaultParams(template.defaultParams);
    const maxLimit = this.asOptionalInteger(template.maxLimit, 'template.maxLimit');

    return {
      id,
      objectApiName,
      description: this.asOptionalString(template.description),
      soql,
      defaultParams,
      maxLimit
    };
  }

  private normalizeDefaultParams(value: unknown): QueryTemplate['defaultParams'] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const params = this.requireObject(value, 'template.defaultParams must be an object');
    const entries = Object.entries(params);

    if (entries.length === 0) {
      return undefined;
    }

    const normalized: NonNullable<QueryTemplate['defaultParams']> = {};

    for (const [key, entry] of entries) {
      const paramKey = key.trim();
      if (paramKey.length === 0) {
        throw new BadRequestException('template.defaultParams keys must be non-empty strings');
      }

      if (typeof entry === 'string' || typeof entry === 'boolean') {
        normalized[paramKey] = entry;
        continue;
      }

      if (typeof entry === 'number' && Number.isFinite(entry)) {
        normalized[paramKey] = entry;
        continue;
      }

      throw new BadRequestException(`template.defaultParams.${paramKey} must be string, number, or boolean`);
    }

    return normalized;
  }

  private requireObject(value: unknown, message: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(message);
    }

    return value as Record<string, unknown>;
  }

  private requireString(value: unknown, message: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private asOptionalInteger(value: unknown, fieldName: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }

    return value;
  }
}
