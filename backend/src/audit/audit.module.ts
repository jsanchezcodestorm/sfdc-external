import { Global, Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { AuditExceptionFilter } from './audit-exception.filter';
import { AuditReadService } from './audit-read.service';
import { AuditWriteService } from './audit-write.service';
import { AuditController } from './audit.controller';
import { QueryAuditService } from './query-audit.service';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  imports: [PrismaModule, AuthModule, AclModule, SalesforceModule, VisibilityModule],
  controllers: [AuditController],
  providers: [
    RequestContextService,
    AuditWriteService,
    AuditReadService,
    QueryAuditService,
    AuditExceptionFilter,
  ],
  exports: [
    RequestContextService,
    AuditWriteService,
    AuditReadService,
    QueryAuditService,
    AuditExceptionFilter,
  ],
})
export class AuditModule {}
