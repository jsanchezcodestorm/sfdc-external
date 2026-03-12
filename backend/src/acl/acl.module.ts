import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AclGuard } from '../common/guards/acl.guard';
import { SalesforceModule } from '../salesforce/salesforce.module';

import { AclAdminConfigRepository } from './acl-admin-config.repository';
import { AclAdminConfigService } from './acl-admin-config.service';
import { AclConfigRepository } from './acl-config.repository';
import { AclContactPermissionsAdminService } from './acl-contact-permissions-admin.service';
import { AclContactPermissionsRepository } from './acl-contact-permissions.repository';
import { AclController } from './acl.controller';
import { AclService } from './acl.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => SalesforceModule)],
  controllers: [AclController],
  providers: [
    AclService,
    AclGuard,
    AclConfigRepository,
    AclAdminConfigRepository,
    AclAdminConfigService,
    AclContactPermissionsRepository,
    AclContactPermissionsAdminService
  ],
  exports: [
    AclService,
    AclGuard,
    AclConfigRepository,
    AclAdminConfigRepository,
    AclAdminConfigService,
    AclContactPermissionsRepository,
    AclContactPermissionsAdminService
  ]
})
export class AclModule {}
