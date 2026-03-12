import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { normalizeCanonicalPermissionCode } from '../acl/acl-config.validation';
import { AuditWriteService } from '../audit/audit-write.service';
import { ResourceAccessService } from '../common/services/resource-access.service';

import { AppsAdminConfigRepository } from './apps-admin-config.repository';
import type { AppAdminListResponse, AppAdminResponse, AppConfig } from './apps.types';

const APP_SORT_ORDER_MAX = 1_000_000;

@Injectable()
export class AppsAdminService {
  constructor(
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly auditWriteService: AuditWriteService
  ) {}

  async listApps(): Promise<AppAdminListResponse> {
    return {
      items: await this.appsAdminConfigRepository.listSummaries()
    };
  }

  async getApp(appId: string): Promise<AppAdminResponse> {
    this.resourceAccessService.assertKebabCaseId(appId, 'appId');
    return {
      app: await this.appsAdminConfigRepository.getApp(appId)
    };
  }

  async createApp(payload: unknown): Promise<AppAdminResponse> {
    const app = await this.normalizeApp(undefined, payload);
    this.resourceAccessService.assertKebabCaseId(app.id, 'app.id');

    if (await this.appsAdminConfigRepository.hasApp(app.id)) {
      throw new ConflictException(`App config ${app.id} already exists`);
    }

    await this.appsAdminConfigRepository.upsertApp(app);
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'APP_CONFIG_CREATE',
      targetType: 'app-config',
      targetId: app.id,
      payload: app,
      metadata: {
        entityCount: app.entityIds.length,
        permissionCount: app.permissionCodes.length,
        sortOrder: app.sortOrder
      }
    });

    return this.getApp(app.id);
  }

  async updateApp(appId: string, payload: unknown): Promise<AppAdminResponse> {
    this.resourceAccessService.assertKebabCaseId(appId, 'appId');

    if (!(await this.appsAdminConfigRepository.hasApp(appId))) {
      throw new NotFoundException(`App config ${appId} not found`);
    }

    const app = await this.normalizeApp(appId, payload);
    await this.appsAdminConfigRepository.upsertApp(app);
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'APP_CONFIG_UPDATE',
      targetType: 'app-config',
      targetId: appId,
      payload: app,
      metadata: {
        entityCount: app.entityIds.length,
        permissionCount: app.permissionCodes.length,
        sortOrder: app.sortOrder
      }
    });

    return this.getApp(appId);
  }

  async deleteApp(appId: string): Promise<void> {
    this.resourceAccessService.assertKebabCaseId(appId, 'appId');

    if (!(await this.appsAdminConfigRepository.hasApp(appId))) {
      throw new NotFoundException(`App config ${appId} not found`);
    }

    await this.appsAdminConfigRepository.deleteApp(appId);
    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'APP_CONFIG_DELETE',
      targetType: 'app-config',
      targetId: appId,
      metadata: {
        appId
      }
    });
  }

  normalizeAppForPersistence(
    routeAppId: string | undefined,
    value: unknown
  ): Promise<AppConfig> {
    return this.normalizeApp(routeAppId, value);
  }

  private async normalizeApp(routeAppId: string | undefined, value: unknown): Promise<AppConfig> {
    const payload = this.requireObject(value, 'app payload must be an object');
    const id = this.requireString(payload.id, 'app.id is required');

    if (routeAppId && routeAppId !== id) {
      throw new BadRequestException('app.id must match route appId');
    }

    this.resourceAccessService.assertKebabCaseId(id, 'app.id');
    const label = this.requireString(payload.label, 'app.label is required');
    const entityIds = this.normalizeEntityIds(payload.entityIds);
    const permissionCodes = this.normalizePermissionCodes(payload.permissionCodes);
    const app: AppConfig = {
      id,
      label,
      description: this.asOptionalString(payload.description),
      sortOrder: this.normalizeSortOrder(payload.sortOrder),
      entityIds,
      permissionCodes
    };

    await this.appsAdminConfigRepository.assertEntityIdsExist(entityIds);
    await this.appsAdminConfigRepository.assertPermissionCodesExist(permissionCodes);

    return app;
  }

  private normalizeEntityIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('app.entityIds must be an array');
    }

    const entityIds = value.map((entry, index) => {
      const entityId = this.requireString(entry, `app.entityIds[${index}] must be a non-empty string`);
      this.resourceAccessService.assertEntityId(entityId, `app.entityIds[${index}]`);
      return entityId;
    });
    const uniqueEntityIds = [...new Set(entityIds)];

    if (uniqueEntityIds.length !== entityIds.length) {
      throw new BadRequestException('app.entityIds must not contain duplicates');
    }

    return entityIds;
  }

  private normalizePermissionCodes(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('app.permissionCodes must be an array');
    }

    const permissionCodes = value.map((entry, index) =>
      normalizeCanonicalPermissionCode(entry, `app.permissionCodes[${index}]`)
    );
    const uniquePermissionCodes = [...new Set(permissionCodes)];

    if (uniquePermissionCodes.length !== permissionCodes.length) {
      throw new BadRequestException('app.permissionCodes must not contain duplicates');
    }

    return permissionCodes;
  }

  private normalizeSortOrder(value: unknown): number {
    if (value === undefined || value === null || value === '') {
      return 0;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > APP_SORT_ORDER_MAX) {
      throw new BadRequestException(`app.sortOrder must be an integer between 0 and ${APP_SORT_ORDER_MAX}`);
    }

    return value;
  }

  private requireObject(value: unknown, message: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(message);
    }

    return value as Record<string, unknown>;
  }

  private requireString(value: unknown, message: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
}
