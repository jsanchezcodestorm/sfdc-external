import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AclService } from '../../acl/acl.service';
import { AuditWriteService } from '../../audit/audit-write.service';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import type { QueryTemplate } from '../query.types';

import {
  QueryAdminTemplateRepository,
  type QueryTemplateAdminSummary
} from './query-admin-template.repository';
import { QueryTemplateCompiler } from './query-template.compiler';
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
    private readonly aclService: AclService,
    private readonly queryTemplateCompiler: QueryTemplateCompiler,
    private readonly auditWriteService: AuditWriteService
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
    const existedBefore = await this.templateExists(templateId);

    if (template.id !== templateId) {
      throw new BadRequestException('template.id must match route templateId');
    }

    await this.queryAdminTemplateRepository.upsertTemplate(template);
    this.queryTemplateRepository.evictTemplate(templateId);
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: existedBefore ? 'QUERY_TEMPLATE_UPDATE' : 'QUERY_TEMPLATE_CREATE',
      targetType: 'query-template',
      targetId: templateId,
      objectApiName: template.objectApiName,
      payload: template,
      metadata: {
        hasDefaultParams: Boolean(template.defaultParams),
        maxLimit: template.maxLimit ?? null
      }
    });

    return this.getTemplate(templateId);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    this.resourceAccessService.assertKebabCaseId(templateId, 'templateId');
    await this.queryAdminTemplateRepository.deleteTemplate(templateId);
    this.queryTemplateRepository.evictTemplate(templateId);
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'QUERY_TEMPLATE_DELETE',
      targetType: 'query-template',
      targetId: templateId,
      metadata: {
        templateId
      }
    });
  }

  private normalizeTemplate(value: unknown): QueryTemplate {
    const payload = this.requireObject(value, 'Query template payload must be an object');
    const id = this.requireString(payload.id, 'template.id is required');
    const objectApiName = this.requireString(payload.objectApiName, 'template.objectApiName is required');
    const soql = this.requireString(payload.soql, 'template.soql is required');
    const defaultParams = this.normalizeDefaultParams(payload.defaultParams);
    const maxLimit = this.asOptionalInteger(payload.maxLimit, 'template.maxLimit');

    const template: QueryTemplate = {
      id,
      objectApiName,
      description: this.asOptionalString(payload.description),
      soql,
      defaultParams,
      maxLimit
    };

    this.queryTemplateCompiler.validateVisibilityCompatibleTemplate(template);
    return template;
  }

  private async templateExists(templateId: string): Promise<boolean> {
    try {
      await this.queryAdminTemplateRepository.getTemplate(templateId);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return false;
      }

      throw error;
    }
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
