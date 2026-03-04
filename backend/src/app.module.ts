import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AclModule } from './acl/acl.module';
import { AuthModule } from './auth/auth.module';
import { EntitiesModule } from './entities/entities.module';
import { GlobalSearchModule } from './global-search/global-search.module';
import { HealthModule } from './health/health.module';
import { NavigationModule } from './navigation/navigation.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueryModule } from './query/query.module';
import { SalesforceModule } from './salesforce/salesforce.module';
import { VisibilityModule } from './visibility/visibility.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true
    }),
    PrismaModule,
    AclModule,
    AuthModule,
    SalesforceModule,
    VisibilityModule,
    EntitiesModule,
    QueryModule,
    NavigationModule,
    GlobalSearchModule,
    HealthModule
  ]
})
export class AppModule {}
