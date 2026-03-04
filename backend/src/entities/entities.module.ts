import { Module } from '@nestjs/common';

import { AclModule } from '../acl/acl.module';
import { AuthModule } from '../auth/auth.module';
import { VisibilityModule } from '../visibility/visibility.module';

import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';

@Module({
  imports: [AuthModule, AclModule, VisibilityModule],
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService]
})
export class EntitiesModule {}
