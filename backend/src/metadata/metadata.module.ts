import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AppsModule } from '../apps/apps.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EntitiesModule } from '../entities/entities.module';
import { QueryModule } from '../query/query.module';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { MetadataController } from './metadata.controller';
import { MetadataAdminService } from './metadata.service';
import { MetadataEntryNormalizerService } from './services/metadata-entry-normalizer.service';
import { MetadataPackageCodecService } from './services/metadata-package-codec.service';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    AclModule,
    AppsModule,
    EntitiesModule,
    QueryModule,
    VisibilityModule,
    SalesforceModule,
  ],
  controllers: [MetadataController],
  providers: [MetadataAdminService, MetadataEntryNormalizerService, MetadataPackageCodecService],
})
export class MetadataModule {}
