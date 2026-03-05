import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../auth/session-user.interface';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceService } from '../salesforce/salesforce.service';

import type { QueryTemplateParams } from './query.types';
import { QueryTemplateCompiler } from './services/query-template.compiler';
import { QueryTemplateRepository } from './services/query-template.repository';

@Injectable()
export class QueryService {
  constructor(
    private readonly resourceAccessService: ResourceAccessService,
    private readonly queryTemplateRepository: QueryTemplateRepository,
    private readonly queryTemplateCompiler: QueryTemplateCompiler,
    private readonly salesforceService: SalesforceService
  ) {}

  async executeTemplate(user: SessionUser, templateId: string, params: QueryTemplateParams): Promise<unknown> {
    this.resourceAccessService.assertKebabCaseId(templateId, 'templateId');

    const template = await this.queryTemplateRepository.getTemplate(templateId);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `query:${templateId}`,
      template.objectApiName
    );

    const soql = this.queryTemplateCompiler.compile(template, params);
    const result = await this.salesforceService.executeReadOnlyQuery(soql);

    return {
      templateId,
      objectApiName: template.objectApiName,
      soql,
      result,
      visibility
    };
  }
}
