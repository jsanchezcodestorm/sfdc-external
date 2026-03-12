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
  UseGuards
} from '@nestjs/common';

import { CsrfGuard } from '../auth/guards/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/session-user.interface';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { DashboardsService } from './dashboards.service';
import { RunDashboardDto } from './dto/run-dashboard.dto';
import { SearchDashboardFieldsDto } from './dto/search-dashboard-fields.dto';
import { SearchDashboardSuggestionsDto } from './dto/search-dashboard-suggestions.dto';
import { UpdateDashboardDefinitionSharesDto } from './dto/update-dashboard-definition-shares.dto';
import { UpdateDashboardFolderSharesDto } from './dto/update-dashboard-folder-shares.dto';
import { UpsertDashboardDefinitionDto } from './dto/upsert-dashboard-definition.dto';
import { UpsertDashboardFolderDto } from './dto/upsert-dashboard-folder.dto';

@Controller('dashboards')
@UseGuards(JwtAuthGuard, CsrfGuard, AclGuard)
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('apps/:appId/workspace')
  @AclResource('rest:dashboards-read')
  getWorkspace(@CurrentUser() user: SessionUser, @Param('appId') appId: string): Promise<unknown> {
    return this.dashboardsService.getWorkspace(user, appId);
  }

  @Get('apps/:appId/folders/:folderId')
  @AclResource('rest:dashboards-read')
  getFolder(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('folderId') folderId: string
  ): Promise<unknown> {
    return this.dashboardsService.getFolder(user, appId, folderId);
  }

  @Post('apps/:appId/folders')
  @AclResource('rest:dashboards-write')
  createFolder(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Body() dto: UpsertDashboardFolderDto
  ): Promise<unknown> {
    return this.dashboardsService.createFolder(user, appId, dto.folder);
  }

  @Put('apps/:appId/folders/:folderId')
  @AclResource('rest:dashboards-write')
  updateFolder(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('folderId') folderId: string,
    @Body() dto: UpsertDashboardFolderDto
  ): Promise<unknown> {
    return this.dashboardsService.updateFolder(user, appId, folderId, dto.folder);
  }

  @Delete('apps/:appId/folders/:folderId')
  @AclResource('rest:dashboards-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFolder(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('folderId') folderId: string
  ): Promise<void> {
    await this.dashboardsService.deleteFolder(user, appId, folderId);
  }

  @Put('apps/:appId/folders/:folderId/shares')
  @AclResource('rest:dashboards-write')
  updateFolderShares(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('folderId') folderId: string,
    @Body() dto: UpdateDashboardFolderSharesDto
  ): Promise<unknown> {
    return this.dashboardsService.updateFolderShares(user, appId, folderId, dto.shares);
  }

  @Get('apps/:appId/dashboards/:dashboardId')
  @AclResource('rest:dashboards-read')
  getDashboard(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('dashboardId') dashboardId: string
  ): Promise<unknown> {
    return this.dashboardsService.getDashboard(user, appId, dashboardId);
  }

  @Post('apps/:appId/dashboards')
  @AclResource('rest:dashboards-write')
  createDashboard(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Body() dto: UpsertDashboardDefinitionDto
  ): Promise<unknown> {
    return this.dashboardsService.createDashboard(user, appId, dto.dashboard);
  }

  @Put('apps/:appId/dashboards/:dashboardId')
  @AclResource('rest:dashboards-write')
  updateDashboard(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() dto: UpsertDashboardDefinitionDto
  ): Promise<unknown> {
    return this.dashboardsService.updateDashboard(user, appId, dashboardId, dto.dashboard);
  }

  @Delete('apps/:appId/dashboards/:dashboardId')
  @AclResource('rest:dashboards-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDashboard(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('dashboardId') dashboardId: string
  ): Promise<void> {
    await this.dashboardsService.deleteDashboard(user, appId, dashboardId);
  }

  @Put('apps/:appId/dashboards/:dashboardId/shares')
  @AclResource('rest:dashboards-write')
  updateDashboardShares(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() dto: UpdateDashboardDefinitionSharesDto
  ): Promise<unknown> {
    return this.dashboardsService.updateDashboardShares(user, appId, dashboardId, dto.shares);
  }

  @Post('apps/:appId/dashboards/:dashboardId/run')
  @AclResource('rest:dashboards-read')
  runDashboard(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() dto: RunDashboardDto
  ): Promise<unknown> {
    return this.dashboardsService.runDashboard(user, appId, dashboardId, dto);
  }

  @Get('apps/:appId/suggestions/contacts')
  @AclResource('rest:dashboards-write')
  searchContacts(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Query() query: SearchDashboardSuggestionsDto
  ): Promise<unknown> {
    return this.dashboardsService.searchContacts(user, appId, query.q, query.limit);
  }

  @Get('apps/:appId/suggestions/permissions')
  @AclResource('rest:dashboards-write')
  searchPermissions(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Query() query: SearchDashboardSuggestionsDto
  ): Promise<unknown> {
    return this.dashboardsService.searchPermissions(user, appId, query.q, query.limit);
  }

  @Get('apps/:appId/suggestions/reports')
  @AclResource('rest:dashboards-write')
  searchSourceReports(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Query() query: SearchDashboardSuggestionsDto
  ): Promise<unknown> {
    return this.dashboardsService.searchSourceReports(user, appId, query.q, query.limit);
  }

  @Get('apps/:appId/suggestions/fields')
  @AclResource('rest:dashboards-write')
  searchSourceReportFields(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Query() query: SearchDashboardFieldsDto
  ): Promise<unknown> {
    return this.dashboardsService.searchSourceReportFields(
      user,
      appId,
      query.reportId,
      query.q,
      query.limit
    );
  }
}
