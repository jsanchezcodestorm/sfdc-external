import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';

import { AclService } from '../acl/acl.service';
import type { SessionUser } from '../auth/session-user.interface';
import { resolveConfigFile } from '../common/utils/config-path.util';
import { SalesforceService } from '../salesforce/salesforce.service';
import { VisibilityService } from '../visibility/visibility.service';

interface QueryTemplate {
  id: string;
  objectApiName: string;
  soql: string;
  defaultParams?: Record<string, string | number | boolean>;
  maxLimit?: number;
}

@Injectable()
export class QueryService {
  constructor(
    private readonly aclService: AclService,
    private readonly visibilityService: VisibilityService,
    private readonly salesforceService: SalesforceService
  ) {}

  async executeTemplate(
    user: SessionUser,
    templateId: string,
    params: Record<string, string | number | boolean>
  ): Promise<unknown> {
    this.assertTemplateId(templateId);

    if (!this.aclService.canAccess(user.permissions, `query:${templateId}`)) {
      throw new ForbiddenException(`ACL denied query:${templateId}`);
    }

    const template = this.loadTemplate(templateId);
    const visibility = await this.visibilityService.evaluateForObject(user, template.objectApiName);

    if (visibility.decision === 'DENY') {
      throw new ForbiddenException(`Visibility denied (${visibility.reasonCode}) for ${template.objectApiName}`);
    }

    const soql = this.compileTemplate(template, params);
    const result = await this.salesforceService.executeReadOnlyQuery(soql);

    return {
      templateId,
      objectApiName: template.objectApiName,
      soql,
      result,
      visibility
    };
  }

  private loadTemplate(templateId: string): QueryTemplate {
    const filePath = resolveConfigFile(`queries/templates/${templateId}.json`);

    if (!filePath) {
      throw new NotFoundException(`Query template not found for ${templateId}`);
    }

    const template = JSON.parse(readFileSync(filePath, 'utf8')) as QueryTemplate;

    if (!template.soql || !template.objectApiName) {
      throw new BadRequestException(`Template ${templateId} is invalid`);
    }

    return template;
  }

  private compileTemplate(
    template: QueryTemplate,
    params: Record<string, string | number | boolean>
  ): string {
    const mergedParams = {
      ...(template.defaultParams ?? {}),
      ...params
    };

    return template.soql.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token: string) => {
      if (!(token in mergedParams)) {
        throw new BadRequestException(`Missing template parameter: ${token}`);
      }

      return this.serializeToken(token, mergedParams[token], template.maxLimit ?? 200);
    });
  }

  private serializeToken(token: string, value: string | number | boolean, maxLimit: number): string {
    if (token.toLowerCase().includes('limit')) {
      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maxLimit) {
        throw new BadRequestException(`Invalid ${token}; accepted range is 1..${maxLimit}`);
      }

      return String(parsed);
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException(`Invalid numeric value for ${token}`);
      }

      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    const escaped = value.replace(/'/g, "\\'");
    return `'${escaped}'`;
  }

  private assertTemplateId(templateId: string): void {
    if (!/^[a-z0-9-]+$/.test(templateId)) {
      throw new BadRequestException('templateId must be lowercase kebab-case');
    }
  }
}
