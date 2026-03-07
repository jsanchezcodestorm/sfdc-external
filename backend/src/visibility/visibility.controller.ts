import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { EvaluateVisibilityDebugDto } from './dto/evaluate-visibility-debug.dto';
import { PreviewVisibilityDebugDto } from './dto/preview-visibility-debug.dto';
import { SearchVisibilityDebugContactsDto } from './dto/search-visibility-debug-contacts.dto';
import { UpsertVisibilityAssignmentDto } from './dto/upsert-visibility-assignment.dto';
import { UpsertVisibilityConeDto } from './dto/upsert-visibility-cone.dto';
import { UpsertVisibilityRuleDto } from './dto/upsert-visibility-rule.dto';
import { VisibilityAdminService } from './visibility-admin.service';

@Controller('visibility')
@UseGuards(JwtAuthGuard, AclGuard)
export class VisibilityController {
  constructor(private readonly visibilityAdminService: VisibilityAdminService) {}

  @Get('admin/cones')
  @AclResource('rest:visibility-admin')
  listCones(): Promise<unknown> {
    return this.visibilityAdminService.listCones();
  }

  @Get('admin/cones/:coneId')
  @AclResource('rest:visibility-admin')
  getCone(@Param('coneId') coneId: string): Promise<unknown> {
    return this.visibilityAdminService.getCone(coneId);
  }

  @Post('admin/cones')
  @AclResource('rest:visibility-admin')
  createCone(@Body() payload: UpsertVisibilityConeDto): Promise<unknown> {
    return this.visibilityAdminService.createCone(payload);
  }

  @Put('admin/cones/:coneId')
  @AclResource('rest:visibility-admin')
  updateCone(
    @Param('coneId') coneId: string,
    @Body() payload: UpsertVisibilityConeDto,
  ): Promise<unknown> {
    return this.visibilityAdminService.updateCone(coneId, payload);
  }

  @Delete('admin/cones/:coneId')
  @AclResource('rest:visibility-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCone(@Param('coneId') coneId: string): Promise<void> {
    await this.visibilityAdminService.deleteCone(coneId);
  }

  @Get('admin/rules')
  @AclResource('rest:visibility-admin')
  listRules(): Promise<unknown> {
    return this.visibilityAdminService.listRules();
  }

  @Get('admin/rules/:ruleId')
  @AclResource('rest:visibility-admin')
  getRule(@Param('ruleId') ruleId: string): Promise<unknown> {
    return this.visibilityAdminService.getRule(ruleId);
  }

  @Post('admin/rules')
  @AclResource('rest:visibility-admin')
  createRule(@Body() payload: UpsertVisibilityRuleDto): Promise<unknown> {
    return this.visibilityAdminService.createRule(payload);
  }

  @Put('admin/rules/:ruleId')
  @AclResource('rest:visibility-admin')
  updateRule(
    @Param('ruleId') ruleId: string,
    @Body() payload: UpsertVisibilityRuleDto,
  ): Promise<unknown> {
    return this.visibilityAdminService.updateRule(ruleId, payload);
  }

  @Delete('admin/rules/:ruleId')
  @AclResource('rest:visibility-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(@Param('ruleId') ruleId: string): Promise<void> {
    await this.visibilityAdminService.deleteRule(ruleId);
  }

  @Get('admin/assignments')
  @AclResource('rest:visibility-admin')
  listAssignments(): Promise<unknown> {
    return this.visibilityAdminService.listAssignments();
  }

  @Get('admin/assignments/:assignmentId')
  @AclResource('rest:visibility-admin')
  getAssignment(@Param('assignmentId') assignmentId: string): Promise<unknown> {
    return this.visibilityAdminService.getAssignment(assignmentId);
  }

  @Post('admin/assignments')
  @AclResource('rest:visibility-admin')
  createAssignment(@Body() payload: UpsertVisibilityAssignmentDto): Promise<unknown> {
    return this.visibilityAdminService.createAssignment(payload);
  }

  @Put('admin/assignments/:assignmentId')
  @AclResource('rest:visibility-admin')
  updateAssignment(
    @Param('assignmentId') assignmentId: string,
    @Body() payload: UpsertVisibilityAssignmentDto,
  ): Promise<unknown> {
    return this.visibilityAdminService.updateAssignment(assignmentId, payload);
  }

  @Delete('admin/assignments/:assignmentId')
  @AclResource('rest:visibility-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAssignment(@Param('assignmentId') assignmentId: string): Promise<void> {
    await this.visibilityAdminService.deleteAssignment(assignmentId);
  }

  @Get('admin/debug/contact-suggestions')
  @AclResource('rest:visibility-admin')
  searchDebugContacts(@Query() query: SearchVisibilityDebugContactsDto): Promise<unknown> {
    return this.visibilityAdminService.searchDebugContacts(query.q, query.limit);
  }

  @Post('admin/debug/evaluate')
  @AclResource('rest:visibility-admin')
  evaluateVisibility(@Body() dto: EvaluateVisibilityDebugDto): Promise<unknown> {
    return this.visibilityAdminService.evaluateDebug(dto);
  }

  @Post('admin/debug/preview')
  @AclResource('rest:visibility-admin')
  previewVisibility(@Body() dto: PreviewVisibilityDebugDto): Promise<unknown> {
    return this.visibilityAdminService.previewDebug(dto);
  }
}
