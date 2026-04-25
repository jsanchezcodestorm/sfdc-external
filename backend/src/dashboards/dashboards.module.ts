import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AppsModule } from '../apps/apps.module';
import { AuthModule } from '../auth/auth.module';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { ReportsModule } from '../reports/reports.module';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { DashboardAccessPolicyService } from './services/dashboard-access-policy.service';
import { DashboardAggregateWidgetRunnerService } from './services/dashboard-aggregate-widget-runner.service';
import { DashboardAppConfigService } from './services/dashboard-app-config.service';
import { DashboardDefinitionReaderService } from './services/dashboard-definition-reader.service';
import { DashboardDefinitionValidatorService } from './services/dashboard-definition-validator.service';
import { DashboardDefinitionsRuntimeService } from './services/dashboard-definitions-runtime.service';
import { DashboardFoldersRuntimeService } from './services/dashboard-folders-runtime.service';
import { DashboardInputNormalizerService } from './services/dashboard-input-normalizer.service';
import { DashboardRecordsRepository } from './services/dashboard-records.repository';
import { DashboardResponseMapperService } from './services/dashboard-response-mapper.service';
import { DashboardRowsWidgetRunnerService } from './services/dashboard-rows-widget-runner.service';
import { DashboardRuntimeFilterService } from './services/dashboard-runtime-filter.service';
import { DashboardRunnerService } from './services/dashboard-runner.service';
import { DashboardShareCodecService } from './services/dashboard-share-codec.service';
import { DashboardSuggestionsService } from './services/dashboard-suggestions.service';
import { DashboardValueService } from './services/dashboard-value.service';
import { DashboardWidgetInputNormalizerService } from './services/dashboard-widget-input-normalizer.service';
import { DashboardWidgetRunnerService } from './services/dashboard-widget-runner.service';

@Module({
  imports: [AuthModule, AclModule, AppsModule, ReportsModule, VisibilityModule, SalesforceModule],
  controllers: [DashboardsController],
  providers: [
    DashboardsService,
    DashboardAccessPolicyService,
    DashboardAggregateWidgetRunnerService,
    DashboardAppConfigService,
    DashboardDefinitionReaderService,
    DashboardDefinitionValidatorService,
    DashboardDefinitionsRuntimeService,
    DashboardFoldersRuntimeService,
    DashboardInputNormalizerService,
    DashboardRecordsRepository,
    DashboardResponseMapperService,
    DashboardRowsWidgetRunnerService,
    DashboardRuntimeFilterService,
    DashboardRunnerService,
    DashboardShareCodecService,
    DashboardSuggestionsService,
    DashboardValueService,
    DashboardWidgetInputNormalizerService,
    DashboardWidgetRunnerService,
    ResourceAccessService
  ],
  exports: [DashboardsService]
})
export class DashboardsModule {}
