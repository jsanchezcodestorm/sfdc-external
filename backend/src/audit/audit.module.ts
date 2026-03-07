import { Global, Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AuditExceptionFilter } from './audit-exception.filter';
import { AuditReadService } from './audit-read.service';
import { AuditWriteService } from './audit-write.service';
import { AuditController } from './audit.controller';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  imports: [PrismaModule, AuthModule, AclModule],
  controllers: [AuditController],
  providers: [
    RequestContextService,
    AuditWriteService,
    AuditReadService,
    AuditExceptionFilter,
  ],
  exports: [
    RequestContextService,
    AuditWriteService,
    AuditReadService,
    AuditExceptionFilter,
  ],
})
export class AuditModule {}
