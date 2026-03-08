import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';

import { CsrfGuard } from '../auth/guards/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/session-user.interface';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { ExecuteTemplateDto } from './dto/execute-template.dto';
import { UpsertQueryTemplateDto } from './dto/upsert-query-template.dto';
import { QueryService } from './query.service';
import { QueryAdminTemplateService } from './services/query-admin-template.service';

@Controller('query')
@UseGuards(JwtAuthGuard, CsrfGuard, AclGuard)
export class QueryController {
  constructor(
    private readonly queryService: QueryService,
    private readonly queryAdminTemplateService: QueryAdminTemplateService
  ) {}

  @Get('admin/templates')
  @AclResource('rest:query-template-admin')
  listAdminTemplates(): Promise<unknown> {
    return this.queryAdminTemplateService.listTemplates();
  }

  @Get('admin/templates/:templateId')
  @AclResource('rest:query-template-admin')
  getAdminTemplate(@Param('templateId') templateId: string): Promise<unknown> {
    return this.queryAdminTemplateService.getTemplate(templateId);
  }

  @Put('admin/templates/:templateId')
  @AclResource('rest:query-template-admin')
  upsertAdminTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: UpsertQueryTemplateDto
  ): Promise<unknown> {
    return this.queryAdminTemplateService.upsertTemplate(templateId, dto);
  }

  @Delete('admin/templates/:templateId')
  @AclResource('rest:query-template-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAdminTemplate(@Param('templateId') templateId: string): Promise<void> {
    await this.queryAdminTemplateService.deleteTemplate(templateId);
  }

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
