import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../auth/session-user.interface';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceService } from '../salesforce/salesforce.service';
import { VisibilityService } from '../visibility/visibility.service';

import type { QueryTemplateParams } from './query.types';
import { QueryTemplateCompiler } from './services/query-template.compiler';
import { QueryTemplateRepository } from './services/query-template.repository';

@Injectable()
export class QueryService {
  constructor(
    private readonly resourceAccessService: ResourceAccessService,
    private readonly queryTemplateRepository: QueryTemplateRepository,
    private readonly queryTemplateCompiler: QueryTemplateCompiler,
    private readonly salesforceService: SalesforceService,
    private readonly visibilityService: VisibilityService
  ) {}

  async executeTemplate(user: SessionUser, templateId: string, params: QueryTemplateParams): Promise<unknown> {
    this.resourceAccessService.assertKebabCaseId(templateId, 'templateId');

    const template = await this.queryTemplateRepository.getTemplate(templateId);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `query:${templateId}`,
      template.objectApiName
    );

    const compiledSoql = this.queryTemplateCompiler.compile(template, params);
    const scopedSoql = this.queryTemplateCompiler.scopeCompiledSoql(compiledSoql, visibility);
    const result = await this.salesforceService.executeReadOnlyQuery(scopedSoql.soql);
    const records =
      typeof result === 'object' &&
      result !== null &&
      Array.isArray((result as { records?: unknown[] }).records)
        ? ((result as { records?: unknown[] }).records ?? [])
        : [];
    await this.visibilityService.recordAudit({
      evaluation: visibility,
      queryKind: 'QUERY_TEMPLATE',
      baseWhere: scopedSoql.baseWhere,
      finalWhere: scopedSoql.finalWhere,
      rowCount: records.length
    });

    return {
      templateId,
      objectApiName: template.objectApiName,
      soql: scopedSoql.soql,
      result,
      visibility
    };
  }
}
