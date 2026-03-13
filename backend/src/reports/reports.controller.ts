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

import { GetReportRunDto } from './dto/get-report-run.dto';
import { SearchReportFieldsDto } from './dto/search-report-fields.dto';
import { SearchReportSuggestionsDto } from './dto/search-report-suggestions.dto';
import { UpdateReportDefinitionSharesDto } from './dto/update-report-definition-shares.dto';
import { UpdateReportFolderSharesDto } from './dto/update-report-folder-shares.dto';
import { UpsertReportDefinitionDto } from './dto/upsert-report-definition.dto';
import { UpsertReportFolderDto } from './dto/upsert-report-folder.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, CsrfGuard, AclGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('apps/:appId/workspace')
  @AclResource('rest:reports-read')
  getWorkspace(@CurrentUser() user: SessionUser, @Param('appId') appId: string): Promise<unknown> {
    return this.reportsService.getWorkspace(user, appId);
  }

  @Get('apps/:appId/folders/:folderId')
  @AclResource('rest:reports-read')
  getFolder(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('folderId') folderId: string
  ): Promise<unknown> {
    return this.reportsService.getFolder(user, appId, folderId);
  }

  @Post('apps/:appId/folders')
  @AclResource('rest:reports-write')
  createFolder(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Body() dto: UpsertReportFolderDto
  ): Promise<unknown> {
    return this.reportsService.createFolder(user, appId, dto.folder);
  }

  @Put('apps/:appId/folders/:folderId')
  @AclResource('rest:reports-write')
  updateFolder(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('folderId') folderId: string,
    @Body() dto: UpsertReportFolderDto
  ): Promise<unknown> {
    return this.reportsService.updateFolder(user, appId, folderId, dto.folder);
  }

  @Delete('apps/:appId/folders/:folderId')
  @AclResource('rest:reports-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFolder(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('folderId') folderId: string
  ): Promise<void> {
    await this.reportsService.deleteFolder(user, appId, folderId);
  }

  @Put('apps/:appId/folders/:folderId/shares')
  @AclResource('rest:reports-write')
  updateFolderShares(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('folderId') folderId: string,
    @Body() dto: UpdateReportFolderSharesDto
  ): Promise<unknown> {
    return this.reportsService.updateFolderShares(user, appId, folderId, dto.shares);
  }

  @Get('apps/:appId/reports/:reportId')
  @AclResource('rest:reports-read')
  getReport(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('reportId') reportId: string
  ): Promise<unknown> {
    return this.reportsService.getReport(user, appId, reportId);
  }

  @Post('apps/:appId/reports')
  @AclResource('rest:reports-write')
  createReport(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Body() dto: UpsertReportDefinitionDto
  ): Promise<unknown> {
    return this.reportsService.createReport(user, appId, dto.report);
  }

  @Put('apps/:appId/reports/:reportId')
  @AclResource('rest:reports-write')
  updateReport(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpsertReportDefinitionDto
  ): Promise<unknown> {
    return this.reportsService.updateReport(user, appId, reportId, dto.report);
  }

  @Delete('apps/:appId/reports/:reportId')
  @AclResource('rest:reports-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReport(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('reportId') reportId: string
  ): Promise<void> {
    await this.reportsService.deleteReport(user, appId, reportId);
  }

  @Put('apps/:appId/reports/:reportId/shares')
  @AclResource('rest:reports-write')
  updateReportShares(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateReportDefinitionSharesDto
  ): Promise<unknown> {
    return this.reportsService.updateReportShares(user, appId, reportId, dto.shares);
  }

  @Get('apps/:appId/reports/:reportId/run')
  @AclResource('rest:reports-read')
  runReport(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Param('reportId') reportId: string,
    @Query() query: GetReportRunDto
  ): Promise<unknown> {
    return this.reportsService.runReport(user, appId, reportId, query.cursor);
  }

  @Get('apps/:appId/suggestions/contacts')
  @AclResource('rest:reports-write')
  searchContacts(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Query() query: SearchReportSuggestionsDto
  ): Promise<unknown> {
    return this.reportsService.searchContacts(user, appId, query.q, query.limit);
  }

  @Get('apps/:appId/suggestions/permissions')
  @AclResource('rest:reports-write')
  searchPermissions(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Query() query: SearchReportSuggestionsDto
  ): Promise<unknown> {
    return this.reportsService.searchPermissions(user, appId, query.q, query.limit);
  }

  @Get('apps/:appId/suggestions/objects')
  @AclResource('rest:reports-write')
  searchObjectApiNames(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Query() query: SearchReportSuggestionsDto
  ): Promise<unknown> {
    return this.reportsService.searchObjectApiNames(user, appId, query.q, query.limit);
  }

  @Get('apps/:appId/suggestions/fields')
  @AclResource('rest:reports-write')
  searchObjectFields(
    @CurrentUser() user: SessionUser,
    @Param('appId') appId: string,
    @Query() query: SearchReportFieldsDto
  ): Promise<unknown> {
    return this.reportsService.searchObjectFields(
      user,
      appId,
      query.objectApiName,
      query.q,
      query.limit
    );
  }
}
