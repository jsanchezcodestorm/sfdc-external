import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/session-user.interface';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { AppsAdminService } from './apps-admin.service';
import { AppsService } from './apps.service';
import type { AppAdminListResponse, AppAdminResponse, AppsAvailableResponse } from './apps.types';
import { UpsertAppAdminDto } from './dto/upsert-app-admin.dto';

@Controller('apps')
@UseGuards(JwtAuthGuard, AclGuard)
export class AppsController {
  constructor(
    private readonly appsService: AppsService,
    private readonly appsAdminService: AppsAdminService
  ) {}

  @Get('available')
  @AclResource('rest:apps-read')
  listAvailableApps(@CurrentUser() user: SessionUser): Promise<AppsAvailableResponse> {
    return this.appsService.listAvailableApps(user);
  }

  @Get('admin')
  @AclResource('rest:apps-admin')
  listAdminApps(): Promise<AppAdminListResponse> {
    return this.appsAdminService.listApps();
  }

  @Get('admin/:appId')
  @AclResource('rest:apps-admin')
  getAdminApp(@Param('appId') appId: string): Promise<AppAdminResponse> {
    return this.appsAdminService.getApp(appId);
  }

  @Post('admin')
  @AclResource('rest:apps-admin')
  createAdminApp(@Body() dto: UpsertAppAdminDto): Promise<AppAdminResponse> {
    return this.appsAdminService.createApp(dto.app);
  }

  @Put('admin/:appId')
  @AclResource('rest:apps-admin')
  updateAdminApp(
    @Param('appId') appId: string,
    @Body() dto: UpsertAppAdminDto
  ): Promise<AppAdminResponse> {
    return this.appsAdminService.updateApp(appId, dto.app);
  }

  @Delete('admin/:appId')
  @AclResource('rest:apps-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAdminApp(@Param('appId') appId: string): Promise<void> {
    await this.appsAdminService.deleteApp(appId);
  }
}
