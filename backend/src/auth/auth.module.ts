import { forwardRef, Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { SalesforceModule } from '../salesforce/salesforce.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [forwardRef(() => AclModule), forwardRef(() => SalesforceModule)],
  controllers: [AuthController],
  providers: [AuthService, CsrfService, JwtAuthGuard, CsrfGuard],
  exports: [AuthService, CsrfService, JwtAuthGuard, CsrfGuard]
})
export class AuthModule {}
