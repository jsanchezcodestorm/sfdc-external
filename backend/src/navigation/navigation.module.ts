import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';

import { NavigationController } from './navigation.controller';
import { NavigationService } from './navigation.service';

@Module({
  imports: [AuthModule, AclModule],
  controllers: [NavigationController],
  providers: [NavigationService]
})
export class NavigationModule {}
