import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AclModule } from './acl/acl.module';
import { AppsModule } from './apps/apps.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { EntitiesModule } from './entities/entities.module';
import { GlobalSearchModule } from './global-search/global-search.module';
import { HealthModule } from './health/health.module';
import { MetadataModule } from './metadata/metadata.module';
import { NavigationModule } from './navigation/navigation.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueryModule } from './query/query.module';
import { ReportsModule } from './reports/reports.module';
import { SalesforceModule } from './salesforce/salesforce.module';
import { SetupModule } from './setup/setup.module';
import { VisibilityModule } from './visibility/visibility.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true
    }),
    AuditModule,
    PrismaModule,
    SetupModule,
    AclModule,
    AppsModule,
    AuthModule,
    SalesforceModule,
    VisibilityModule,
    EntitiesModule,
    QueryModule,
    ReportsModule,
    DashboardsModule,
    NavigationModule,
    GlobalSearchModule,
    HealthModule,
    MetadataModule
  ]
})
export class AppModule {}
