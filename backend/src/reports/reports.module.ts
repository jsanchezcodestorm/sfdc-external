import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AppsModule } from '../apps/apps.module';
import { AuthModule } from '../auth/auth.module';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportQueryCursorService } from './services/report-query-cursor.service';
import { ReportSoqlBuilderService } from './services/report-soql-builder.service';

@Module({
  imports: [AuthModule, AclModule, AppsModule, VisibilityModule, SalesforceModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportQueryCursorService,
    ReportSoqlBuilderService,
    ResourceAccessService
  ],
  exports: [ReportsService, ReportSoqlBuilderService]
})
export class ReportsModule {}
