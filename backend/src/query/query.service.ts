import { Injectable } from '@nestjs/common';

import { QueryAuditService } from '../audit/query-audit.service';
import type { SessionUser } from '../auth/session-user.interface';
import { ResourceAccessService } from '../common/services/resource-access.service';

import type { QueryTemplateParams } from './query.types';
import { QueryTemplateCompiler } from './services/query-template.compiler';
import { QueryTemplateRepository } from './services/query-template.repository';

@Injectable()
export class QueryService {
  constructor(
    private readonly queryAuditService: QueryAuditService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly queryTemplateRepository: QueryTemplateRepository,
    private readonly queryTemplateCompiler: QueryTemplateCompiler,
  ) {}

  async executeTemplate(user: SessionUser, templateId: string, params: QueryTemplateParams): Promise<unknown> {
    this.resourceAccessService.assertKebabCaseId(templateId, 'templateId');

    const template = await this.queryTemplateRepository.getTemplate(templateId);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      `query:${templateId}`,
      template.objectApiName,
      {
        queryKind: 'QUERY_TEMPLATE'
      }
    );

    const compiledSoql = this.queryTemplateCompiler.compile(template, params);
    const scopedSoql = this.queryTemplateCompiler.scopeCompiledSoql(compiledSoql, visibility);
    const result = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'QUERY_TEMPLATE',
      targetId: templateId,
      objectApiName: template.objectApiName,
      resolvedSoql: scopedSoql.soql,
      visibility,
      baseWhere: scopedSoql.baseWhere,
      finalWhere: scopedSoql.finalWhere,
      metadata: {
        templateId,
        params,
        selectedFields: scopedSoql.selectedFields,
      },
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
