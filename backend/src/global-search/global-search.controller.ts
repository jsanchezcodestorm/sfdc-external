import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/session-user.interface';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { SearchDto } from './dto/search.dto';
import { GlobalSearchService } from './global-search.service';

@Controller('global-search')
@UseGuards(JwtAuthGuard, AclGuard)
export class GlobalSearchController {
  constructor(private readonly globalSearchService: GlobalSearchService) {}

  @Get()
  @AclResource('rest:global-search')
  search(@CurrentUser() user: SessionUser, @Query() query: SearchDto): { q: string; actor: string; results: unknown[] } {
    return this.globalSearchService.search(user, query.q);
  }
}
