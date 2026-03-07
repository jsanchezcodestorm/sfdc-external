import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { SalesforceModule } from '../salesforce/salesforce.module';

import { VisibilityAdminService } from './visibility-admin.service';
import { VisibilityController } from './visibility.controller';
import { VisibilityService } from './visibility.service';

@Module({
  imports: [AuthModule, AclModule, SalesforceModule],
  controllers: [VisibilityController],
  providers: [VisibilityService, VisibilityAdminService],
  exports: [VisibilityService]
})
export class VisibilityModule {}
