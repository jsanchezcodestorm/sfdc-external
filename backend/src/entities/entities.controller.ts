import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import type { SessionUser } from '../auth/session-user.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { EntitiesService } from './entities.service';

@Controller('entities')
@UseGuards(JwtAuthGuard, AclGuard)
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Get(':entityId')
  @AclResource('rest:entities-read')
  getEntity(@CurrentUser() user: SessionUser, @Param('entityId') entityId: string): Promise<unknown> {
    return this.entitiesService.getEntity(user, entityId);
  }
}
