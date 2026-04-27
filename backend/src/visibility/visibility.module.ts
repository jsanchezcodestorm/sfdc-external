import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { SalesforceModule } from '../salesforce/salesforce.module';

import { VisibilityAdminService } from './visibility-admin.service';
import { VisibilityAdminDebugPreviewService } from './services/visibility-admin-debug-preview.service';
import { VisibilityAdminInputNormalizerService } from './services/visibility-admin-input-normalizer.service';
import { VisibilityAdminNormalizerService } from './services/visibility-admin-normalizer.service';
import { VisibilityAdminPolicyCacheService } from './services/visibility-admin-policy-cache.service';
import { VisibilityController } from './visibility.controller';
import { VisibilityService } from './visibility.service';

@Module({
  imports: [AuthModule, AclModule, SalesforceModule],
  controllers: [VisibilityController],
  providers: [
    VisibilityService,
    VisibilityAdminService,
    VisibilityAdminDebugPreviewService,
    VisibilityAdminInputNormalizerService,
    VisibilityAdminNormalizerService,
    VisibilityAdminPolicyCacheService,
  ],
  exports: [VisibilityService, VisibilityAdminService]
})
export class VisibilityModule {}
