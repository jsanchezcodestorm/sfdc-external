import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { SessionUser } from '../auth/session-user.interface';
import { AclResource } from '../common/decorators/acl-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AclGuard } from '../common/guards/acl.guard';

import { GetEntityListDto } from './dto/get-entity-list.dto';
import { GetEntityRelatedListDto } from './dto/get-entity-related-list.dto';
import { EntitiesService } from './entities.service';

@Controller('entities')
@UseGuards(JwtAuthGuard, AclGuard)
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Get(':entityId/config')
  @AclResource('rest:entities-read')
  getEntityConfig(@CurrentUser() user: SessionUser, @Param('entityId') entityId: string): Promise<unknown> {
    return this.entitiesService.getEntity(user, entityId);
  }

  @Get(':entityId/list')
  @AclResource('rest:entities-read')
  getEntityList(
    @CurrentUser() user: SessionUser,
    @Param('entityId') entityId: string,
    @Query() query: GetEntityListDto
  ): Promise<unknown> {
    return this.entitiesService.getEntityList(user, entityId, query);
  }

  @Get(':entityId/records/:recordId')
  @AclResource('rest:entities-read')
  getEntityRecord(
    @CurrentUser() user: SessionUser,
    @Param('entityId') entityId: string,
    @Param('recordId') recordId: string
  ): Promise<unknown> {
    return this.entitiesService.getEntityRecord(user, entityId, recordId);
  }

  @Get(':entityId/form')
  @AclResource('rest:entities-read')
  getEntityCreateForm(@CurrentUser() user: SessionUser, @Param('entityId') entityId: string): Promise<unknown> {
    return this.entitiesService.getEntityForm(user, entityId);
  }

  @Get(':entityId/form/:recordId')
  @AclResource('rest:entities-read')
  getEntityEditForm(
    @CurrentUser() user: SessionUser,
    @Param('entityId') entityId: string,
    @Param('recordId') recordId: string
  ): Promise<unknown> {
    return this.entitiesService.getEntityForm(user, entityId, recordId);
  }

  @Get(':entityId/related/:relatedListId')
  @AclResource('rest:entities-read')
  getEntityRelatedList(
    @CurrentUser() user: SessionUser,
    @Param('entityId') entityId: string,
    @Param('relatedListId') relatedListId: string,
    @Query() query: GetEntityRelatedListDto
  ): Promise<unknown> {
    return this.entitiesService.getEntityRelatedList(user, entityId, relatedListId, query);
  }

  @Post(':entityId/records')
  @AclResource('rest:entities-write')
  createEntityRecord(
    @CurrentUser() user: SessionUser,
    @Param('entityId') entityId: string,
    @Body() payload: unknown
  ): Promise<Record<string, unknown>> {
    return this.entitiesService.createEntityRecord(user, entityId, payload);
  }

  @Put(':entityId/records/:recordId')
  @AclResource('rest:entities-write')
  updateEntityRecord(
    @CurrentUser() user: SessionUser,
    @Param('entityId') entityId: string,
    @Param('recordId') recordId: string,
    @Body() payload: unknown
  ): Promise<Record<string, unknown>> {
    return this.entitiesService.updateEntityRecord(user, entityId, recordId, payload);
  }

  @Delete(':entityId/records/:recordId')
  @AclResource('rest:entities-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEntityRecord(
    @CurrentUser() user: SessionUser,
    @Param('entityId') entityId: string,
    @Param('recordId') recordId: string
  ): Promise<void> {
    await this.entitiesService.deleteEntityRecord(user, entityId, recordId);
  }
}
