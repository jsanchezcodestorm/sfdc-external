import { forwardRef, Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [forwardRef(() => AclModule)],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard]
})
export class AuthModule {}
