import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { AuditReadService } from './audit-read.service';
import {
  ListApplicationAuditDto,
  ListSecurityAuditDto,
  ListVisibilityAuditDto,
} from './dto/list-audit.dto';

@Controller('audit')
@UseGuards(JwtAuthGuard, AclGuard)
export class AuditController {
  constructor(private readonly auditReadService: AuditReadService) {}

  @Get('security')
  @AclResource('rest:audit-read')
  listSecurity(@Query() query: ListSecurityAuditDto): Promise<unknown> {
    return this.auditReadService.listSecurityAudit(query);
  }

  @Get('security/:id')
  @AclResource('rest:audit-read')
  getSecurity(@Param('id') id: string): Promise<unknown> {
    return this.auditReadService.getSecurityAudit(id);
  }

  @Get('visibility')
  @AclResource('rest:audit-read')
  listVisibility(@Query() query: ListVisibilityAuditDto): Promise<unknown> {
    return this.auditReadService.listVisibilityAudit(query);
  }

  @Get('visibility/:id')
  @AclResource('rest:audit-read')
  getVisibility(@Param('id') id: string): Promise<unknown> {
    return this.auditReadService.getVisibilityAudit(id);
  }

  @Get('application')
  @AclResource('rest:audit-read')
  listApplication(@Query() query: ListApplicationAuditDto): Promise<unknown> {
    return this.auditReadService.listApplicationAudit(query);
  }

  @Get('application/:id')
  @AclResource('rest:audit-read')
  getApplication(@Param('id') id: string): Promise<unknown> {
    return this.auditReadService.getApplicationAudit(id);
  }
}
