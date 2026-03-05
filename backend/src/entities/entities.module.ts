import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';
import { EntityAdminConfigRepository } from './services/entity-admin-config.repository';
import { EntityAdminConfigService } from './services/entity-admin-config.service';
import { EntityConfigRepository } from './services/entity-config.repository';

@Module({
  imports: [AuthModule, AclModule, VisibilityModule, SalesforceModule],
  controllers: [EntitiesController],
  providers: [
    EntitiesService,
    EntityConfigRepository,
    EntityAdminConfigRepository,
    EntityAdminConfigService,
    ResourceAccessService
  ],
  exports: [EntitiesService]
})
export class EntitiesModule {}
