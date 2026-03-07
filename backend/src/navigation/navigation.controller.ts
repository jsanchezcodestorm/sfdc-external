import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/session-user.interface';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { NavigationService } from './navigation.service';

@Controller('navigation')
@UseGuards(JwtAuthGuard, AclGuard)
export class NavigationController {
  constructor(private readonly navigationService: NavigationService) {}

  @Get()
  @AclResource('rest:navigation-read')
  getNavigation(@CurrentUser() user: SessionUser): { items: Array<{ id: string; target: string; description: string }> } {
    return this.navigationService.getNavigation(user);
  }
}
