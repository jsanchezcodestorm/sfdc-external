import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';

import { VisibilityController } from './visibility.controller';
import { VisibilityService } from './visibility.service';

@Module({
  imports: [AuthModule, AclModule],
  controllers: [VisibilityController],
  providers: [VisibilityService],
  exports: [VisibilityService]
})
export class VisibilityModule {}
