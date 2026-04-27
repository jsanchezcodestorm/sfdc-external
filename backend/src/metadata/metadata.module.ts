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
import { MetadataAclApplierService } from './services/metadata-acl-applier.service';
import { MetadataBasicApplierService } from './services/metadata-basic-applier.service';
import { MetadataDeployApplierService } from './services/metadata-deploy-applier.service';
import { MetadataEntryNormalizerService } from './services/metadata-entry-normalizer.service';
import { MetadataExportService } from './services/metadata-export.service';
import { MetadataPackageCodecService } from './services/metadata-package-codec.service';
import { MetadataPreviewService } from './services/metadata-preview.service';
import { MetadataResolutionService } from './services/metadata-resolution.service';
import { MetadataSectionResolverService } from './services/metadata-section-resolver.service';
import { MetadataVisibilityApplierService } from './services/metadata-visibility-applier.service';

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
  providers: [
    MetadataAdminService,
    MetadataAclApplierService,
    MetadataBasicApplierService,
    MetadataDeployApplierService,
    MetadataEntryNormalizerService,
    MetadataExportService,
    MetadataPackageCodecService,
    MetadataPreviewService,
    MetadataResolutionService,
    MetadataSectionResolverService,
    MetadataVisibilityApplierService,
  ],
})
export class MetadataModule {}
