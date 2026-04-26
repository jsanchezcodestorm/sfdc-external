import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AppsModule } from '../apps/apps.module';
import { AuthModule } from '../auth/auth.module';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportAccessPolicyService } from './services/report-access-policy.service';
import { ReportCursorExecutorService } from './services/report-cursor-executor.service';
import { ReportInputNormalizerService } from './services/report-input-normalizer.service';
import { ReportJsonReaderService } from './services/report-json-reader.service';
import { ReportQueryCursorService } from './services/report-query-cursor.service';
import { ReportResponseMapperService } from './services/report-response-mapper.service';
import { ReportRunResultMapperService } from './services/report-run-result-mapper.service';
import { ReportRunnerService } from './services/report-runner.service';
import { ReportShareGrantNormalizerService } from './services/report-share-grant-normalizer.service';
import { ReportSoqlBuilderService } from './services/report-soql-builder.service';
import { ReportValueParserService } from './services/report-value-parser.service';

@Module({
  imports: [AuthModule, AclModule, AppsModule, VisibilityModule, SalesforceModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportAccessPolicyService,
    ReportCursorExecutorService,
    ReportInputNormalizerService,
    ReportJsonReaderService,
    ReportQueryCursorService,
    ReportResponseMapperService,
    ReportRunResultMapperService,
    ReportRunnerService,
    ReportShareGrantNormalizerService,
    ReportSoqlBuilderService,
    ReportValueParserService,
    ResourceAccessService
  ],
  exports: [ReportsService, ReportSoqlBuilderService]
})
export class ReportsModule {}
