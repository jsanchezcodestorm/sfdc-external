import { forwardRef, Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { SalesforceModule } from '../salesforce/salesforce.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [forwardRef(() => AclModule), forwardRef(() => SalesforceModule)],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard]
})
export class AuthModule {}
