import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { AppsAdminConfigRepository } from './apps-admin-config.repository';
import { AppsAdminService } from './apps-admin.service';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';

@Module({
  imports: [PrismaModule, AuthModule, AclModule, VisibilityModule, AuditModule],
  controllers: [AppsController],
  providers: [AppsAdminConfigRepository, AppsAdminService, AppsService, ResourceAccessService],
  exports: [AppsAdminConfigRepository]
})
export class AppsModule {}
