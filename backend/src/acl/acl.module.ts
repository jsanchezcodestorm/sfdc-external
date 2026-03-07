import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AclGuard } from '../common/guards/acl.guard';

import { AclAdminConfigRepository } from './acl-admin-config.repository';
import { AclAdminConfigService } from './acl-admin-config.service';
import { AclConfigRepository } from './acl-config.repository';
import { AclController } from './acl.controller';
import { AclService } from './acl.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [AclController],
  providers: [AclService, AclGuard, AclConfigRepository, AclAdminConfigRepository, AclAdminConfigService],
  exports: [AclService, AclGuard, AclConfigRepository]
})
export class AclModule {}
