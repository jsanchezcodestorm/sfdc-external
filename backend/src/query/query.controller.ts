import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import type { SessionUser } from '../auth/session-user.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { ExecuteTemplateDto } from './dto/execute-template.dto';
import { QueryService } from './query.service';

@Controller('query')
@UseGuards(JwtAuthGuard, AclGuard)
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('template/:templateId')
  @AclResource('rest:query-execute')
  executeTemplate(
    @CurrentUser() user: SessionUser,
    @Param('templateId') templateId: string,
    @Body() dto: ExecuteTemplateDto
  ): Promise<unknown> {
    return this.queryService.executeTemplate(user, templateId, dto.params ?? {});
  }
}
