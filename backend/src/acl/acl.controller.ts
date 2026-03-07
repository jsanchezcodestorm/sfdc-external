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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { AclAdminConfigService } from './acl-admin-config.service';
import type {
  AclAdminContactPermissionListResponse,
  AclAdminContactPermissionResponse,
  AclAdminContactSuggestionResponse,
  AclAdminDefaultPermissionsResponse,
  AclAdminPermissionListResponse,
  AclAdminPermissionResponse,
  AclAdminResourceListResponse,
  AclAdminResourceResponse
} from './acl-admin.types';
import { AclContactPermissionsAdminService } from './acl-contact-permissions-admin.service';
import { SearchAclContactSuggestionsDto } from './dto/search-acl-contact-suggestions.dto';
import { UpdateContactPermissionsDto } from './dto/update-contact-permissions.dto';
import { UpdateDefaultPermissionsDto } from './dto/update-default-permissions.dto';
import { UpsertAclPermissionDto } from './dto/upsert-acl-permission.dto';
import { UpsertAclResourceDto } from './dto/upsert-acl-resource.dto';

@Controller('acl')
@UseGuards(JwtAuthGuard, AclGuard)
export class AclController {
  constructor(
    private readonly aclAdminConfigService: AclAdminConfigService,
    private readonly aclContactPermissionsAdminService: AclContactPermissionsAdminService
  ) {}

  @Get('admin/permissions')
  @AclResource('rest:acl-config-admin')
  listPermissions(): Promise<AclAdminPermissionListResponse> {
    return this.aclAdminConfigService.listPermissions();
  }

  @Get('admin/permissions/:permissionCode')
  @AclResource('rest:acl-config-admin')
  getPermission(@Param('permissionCode') permissionCode: string): Promise<AclAdminPermissionResponse> {
    return this.aclAdminConfigService.getPermission(permissionCode);
  }

  @Post('admin/permissions')
  @AclResource('rest:acl-config-admin')
  createPermission(@Body() dto: UpsertAclPermissionDto): Promise<AclAdminPermissionResponse> {
    return this.aclAdminConfigService.createPermission(dto.permission);
  }

  @Put('admin/permissions/:permissionCode')
  @AclResource('rest:acl-config-admin')
  updatePermission(
    @Param('permissionCode') permissionCode: string,
    @Body() dto: UpsertAclPermissionDto
  ): Promise<AclAdminPermissionResponse> {
    return this.aclAdminConfigService.updatePermission(permissionCode, dto.permission);
  }

  @Delete('admin/permissions/:permissionCode')
  @AclResource('rest:acl-config-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePermission(@Param('permissionCode') permissionCode: string): Promise<void> {
    await this.aclAdminConfigService.deletePermission(permissionCode);
  }

  @Get('admin/resources')
  @AclResource('rest:acl-config-admin')
  listResources(): Promise<AclAdminResourceListResponse> {
    return this.aclAdminConfigService.listResources();
  }

  @Get('admin/resources/:resourceId')
  @AclResource('rest:acl-config-admin')
  getResource(@Param('resourceId') resourceId: string): Promise<AclAdminResourceResponse> {
    return this.aclAdminConfigService.getResource(resourceId);
  }

  @Post('admin/resources')
  @AclResource('rest:acl-config-admin')
  createResource(@Body() dto: UpsertAclResourceDto): Promise<AclAdminResourceResponse> {
    return this.aclAdminConfigService.createResource(dto.resource);
  }

  @Put('admin/resources/:resourceId')
  @AclResource('rest:acl-config-admin')
  updateResource(
    @Param('resourceId') resourceId: string,
    @Body() dto: UpsertAclResourceDto
  ): Promise<AclAdminResourceResponse> {
    return this.aclAdminConfigService.updateResource(resourceId, dto.resource);
  }

  @Delete('admin/resources/:resourceId')
  @AclResource('rest:acl-config-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteResource(@Param('resourceId') resourceId: string): Promise<void> {
    await this.aclAdminConfigService.deleteResource(resourceId);
  }

  @Get('admin/default-permissions')
  @AclResource('rest:acl-config-admin')
  getDefaultPermissions(): Promise<AclAdminDefaultPermissionsResponse> {
    return this.aclAdminConfigService.getDefaultPermissions();
  }

  @Put('admin/default-permissions')
  @AclResource('rest:acl-config-admin')
  updateDefaultPermissions(
    @Body() dto: UpdateDefaultPermissionsDto
  ): Promise<AclAdminDefaultPermissionsResponse> {
    return this.aclAdminConfigService.updateDefaultPermissions(dto.permissionCodes);
  }

  @Get('admin/contact-permissions')
  @AclResource('rest:acl-config-admin')
  listContactPermissions(): Promise<AclAdminContactPermissionListResponse> {
    return this.aclContactPermissionsAdminService.listContactPermissions();
  }

  @Get('admin/contact-permissions/:contactId')
  @AclResource('rest:acl-config-admin')
  getContactPermissions(
    @Param('contactId') contactId: string
  ): Promise<AclAdminContactPermissionResponse> {
    return this.aclContactPermissionsAdminService.getContactPermissions(contactId);
  }

  @Put('admin/contact-permissions/:contactId')
  @AclResource('rest:acl-config-admin')
  updateContactPermissions(
    @Param('contactId') contactId: string,
    @Body() dto: UpdateContactPermissionsDto
  ): Promise<AclAdminContactPermissionResponse> {
    return this.aclContactPermissionsAdminService.updateContactPermissions(
      contactId,
      dto.permissionCodes
    );
  }

  @Delete('admin/contact-permissions/:contactId')
  @AclResource('rest:acl-config-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContactPermissions(@Param('contactId') contactId: string): Promise<void> {
    await this.aclContactPermissionsAdminService.deleteContactPermissions(contactId);
  }

  @Get('admin/contact-suggestions')
  @AclResource('rest:acl-config-admin')
  searchContacts(
    @Query() query: SearchAclContactSuggestionsDto
  ): Promise<AclAdminContactSuggestionResponse> {
    return this.aclContactPermissionsAdminService.searchContacts(query.q, query.limit);
  }
}
