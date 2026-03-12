import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { QueryAdminTemplateRepository } from './services/query-admin-template.repository';
import { QueryAdminTemplateService } from './services/query-admin-template.service';
import { QueryTemplateCompiler } from './services/query-template.compiler';
import { QueryTemplateRepository } from './services/query-template.repository';

@Module({
  imports: [AuthModule, AclModule, VisibilityModule, SalesforceModule],
  controllers: [QueryController],
  providers: [
    QueryService,
    QueryTemplateRepository,
    QueryAdminTemplateRepository,
    QueryAdminTemplateService,
    QueryTemplateCompiler,
    ResourceAccessService
  ],
  exports: [
    QueryService,
    QueryAdminTemplateRepository,
    QueryAdminTemplateService,
    QueryTemplateRepository
  ]
})
export class QueryModule {}
