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

@Module({
  imports: [AuthModule, AclModule, AppsModule, ReportsModule, VisibilityModule, SalesforceModule],
  controllers: [DashboardsController],
  providers: [DashboardsService, ResourceAccessService],
  exports: [DashboardsService]
})
export class DashboardsModule {}
