import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { normalizeCanonicalPermissionCode } from '../acl/acl-config.validation';
import { AuditWriteService } from '../audit/audit-write.service';
import { ResourceAccessService } from '../common/services/resource-access.service';

import { extractHostFromHttpsUrl, readAllowedAppEmbedHosts } from './app-embed-hosts';
import { AppsAdminConfigRepository } from './apps-admin-config.repository';
import type {
  AppAdminListResponse,
  AppAdminResponse,
  AppConfig,
  AppCustomPageItemConfig,
  AppEmbedOpenMode,
  AppEntityItemConfig,
  AppExternalLinkItemConfig,
  AppHomeItemConfig,
  AppItemConfig,
  AppItemKind,
  AppItemTargetType,
  AppPageAction,
  AppPageBlock,
  AppPageConfig,
  AppReportItemConfig,
  AppUrlOpenMode
} from './apps.types';

const APP_SORT_ORDER_MAX = 1_000_000;
const EMBED_HEIGHT_MAX = 4_000;

@Injectable()
export class AppsAdminService {
  constructor(
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly auditWriteService: AuditWriteService,
    private readonly configService: ConfigService
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
      metadata: this.buildAppAuditMetadata(app)
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
      metadata: this.buildAppAuditMetadata(app)
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
    const items = this.normalizeItems(payload.items);
    const permissionCodes = this.normalizePermissionCodes(payload.permissionCodes);
    const app: AppConfig = {
      id,
      label,
      description: this.asOptionalString(payload.description),
      sortOrder: this.normalizeSortOrder(payload.sortOrder),
      items,
      permissionCodes
    };

    await this.assertAppReferencesExist(app);
    this.assertPageTargetsExist(app.items);
    this.assertIframeHostsAllowed(app.items);

    return app;
  }

  private normalizeItems(value: unknown): AppItemConfig[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('app.items must be an array');
    }

    const items = value.map((entry, index) => this.normalizeItem(entry, index));
    const itemIds = items.map((item) => item.id);
    const uniqueItemIds = [...new Set(itemIds)];

    if (uniqueItemIds.length !== itemIds.length) {
      throw new BadRequestException('app.items must not contain duplicate ids');
    }

    const homeItems = items.filter((item) => item.kind === 'home');
    if (homeItems.length !== 1) {
      throw new BadRequestException('app.items must contain exactly one home item');
    }

    const entityIds = items
      .filter((item): item is AppEntityItemConfig => item.kind === 'entity')
      .map((item) => item.entityId);
    const uniqueEntityIds = [...new Set(entityIds)];

    if (uniqueEntityIds.length !== entityIds.length) {
      throw new BadRequestException('app.items must not contain duplicate entityId assignments');
    }

    return items;
  }

  private normalizeItem(value: unknown, index: number): AppItemConfig {
    const item = this.requireObject(value, `app.items[${index}] must be an object`);
    const id = this.requireKebabCaseString(item.id, `app.items[${index}].id`);
    const kind = this.normalizeItemKind(item.kind, `app.items[${index}].kind`);
    const label = this.requireString(item.label, `app.items[${index}].label is required`);
    const description = this.asOptionalString(item.description);
    const resourceId = this.asOptionalString(item.resourceId);

    switch (kind) {
      case 'home':
        if (resourceId) {
          throw new BadRequestException(`app.items[${index}].resourceId is not allowed for home`);
        }
        return {
          id,
          kind,
          label,
          description,
          page: this.normalizePageConfig(item.page, `app.items[${index}].page`)
        } satisfies AppHomeItemConfig;
      case 'entity':
        return {
          id,
          kind,
          label,
          description,
          resourceId,
          entityId: this.requireKebabCaseString(item.entityId, `app.items[${index}].entityId`)
        } satisfies AppEntityItemConfig;
      case 'custom-page':
        return {
          id,
          kind,
          label,
          description,
          resourceId,
          page: this.normalizePageConfig(item.page, `app.items[${index}].page`)
        } satisfies AppCustomPageItemConfig;
      case 'external-link':
        return this.normalizeExternalLinkItem(
          { id, kind, label, description, resourceId, ...item },
          index
        );
      case 'report':
        return this.normalizeReportItem(
          { id, kind, label, description, resourceId, ...item },
          index
        );
    }
  }

  private normalizeExternalLinkItem(
    item: Record<string, unknown>,
    index: number
  ): AppExternalLinkItemConfig {
    return {
      id: item.id as string,
      kind: 'external-link',
      label: item.label as string,
      description: item.description as string | undefined,
      resourceId: item.resourceId as string | undefined,
      url: this.normalizeHttpsUrl(item.url, `app.items[${index}].url`),
      openMode: this.normalizeEmbedOpenMode(item.openMode, `app.items[${index}].openMode`),
      iframeTitle: this.asOptionalString(item.iframeTitle),
      height: this.normalizeOptionalHeight(item.height, `app.items[${index}].height`)
    };
  }

  private normalizeReportItem(
    item: Record<string, unknown>,
    index: number
  ): AppReportItemConfig {
    return {
      id: item.id as string,
      kind: 'report',
      label: item.label as string,
      description: item.description as string | undefined,
      resourceId: item.resourceId as string | undefined,
      url: this.normalizeHttpsUrl(item.url, `app.items[${index}].url`),
      openMode: this.normalizeEmbedOpenMode(item.openMode, `app.items[${index}].openMode`),
      iframeTitle: this.asOptionalString(item.iframeTitle),
      height: this.normalizeOptionalHeight(item.height, `app.items[${index}].height`),
      providerLabel: this.asOptionalString(item.providerLabel)
    };
  }

  private normalizePageConfig(value: unknown, path: string): AppPageConfig {
    const page = this.requireObject(value, `${path} must be an object`);
    const blocks = this.requireArray(page.blocks, `${path}.blocks must be an array`).map((entry, index) =>
      this.normalizePageBlock(entry, `${path}.blocks[${index}]`),
    );

    return { blocks };
  }

  private normalizePageBlock(value: unknown, path: string): AppPageBlock {
    const block = this.requireObject(value, `${path} must be an object`);
    const type = this.requireString(block.type, `${path}.type is required`);

    switch (type) {
      case 'hero':
        return {
          type,
          title: this.requireString(block.title, `${path}.title is required`),
          body: this.asOptionalString(block.body),
          action: block.action ? this.normalizePageAction(block.action, `${path}.action`) : undefined
        };
      case 'markdown':
        return {
          type,
          markdown: this.requireString(block.markdown, `${path}.markdown is required`)
        };
      case 'link-list':
        return {
          type,
          title: this.asOptionalString(block.title),
          links: this.requireArray(block.links, `${path}.links must be an array`).map((entry, index) =>
            this.normalizePageAction(entry, `${path}.links[${index}]`),
          )
        };
      default:
        throw new BadRequestException(`${path}.type is invalid`);
    }
  }

  private normalizePageAction(value: unknown, path: string): AppPageAction {
    const action = this.requireObject(value, `${path} must be an object`);
    const targetType = this.normalizeTargetType(action.targetType, `${path}.targetType`);
    const target =
      targetType === 'app-item'
        ? this.requireKebabCaseString(action.target, `${path}.target`)
        : this.normalizeHttpsUrl(action.target, `${path}.target`);

    return {
      label: this.requireString(action.label, `${path}.label is required`),
      targetType,
      target,
      openMode: this.normalizeOptionalUrlOpenMode(action.openMode, `${path}.openMode`)
    };
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

  private normalizeItemKind(value: unknown, path: string): AppItemKind {
    const kind = this.requireString(value, `${path} is required`);

    switch (kind) {
      case 'home':
      case 'entity':
      case 'custom-page':
      case 'external-link':
      case 'report':
        return kind;
      default:
        throw new BadRequestException(`${path} is invalid`);
    }
  }

  private normalizeTargetType(value: unknown, path: string): AppItemTargetType {
    const targetType = this.requireString(value, `${path} is required`);

    if (targetType !== 'app-item' && targetType !== 'url') {
      throw new BadRequestException(`${path} is invalid`);
    }

    return targetType;
  }

  private normalizeEmbedOpenMode(value: unknown, path: string): AppEmbedOpenMode {
    const openMode = this.requireString(value, `${path} is required`);

    if (openMode !== 'new-tab' && openMode !== 'iframe') {
      throw new BadRequestException(`${path} is invalid`);
    }

    return openMode;
  }

  private normalizeOptionalUrlOpenMode(value: unknown, path: string): AppUrlOpenMode | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const openMode = this.requireString(value, `${path} is invalid`);
    if (openMode !== 'same-tab' && openMode !== 'new-tab') {
      throw new BadRequestException(`${path} is invalid`);
    }

    return openMode;
  }

  private normalizeHttpsUrl(value: unknown, path: string): string {
    const normalized = this.requireString(value, `${path} is required`);
    if (!extractHostFromHttpsUrl(normalized)) {
      throw new BadRequestException(`${path} must be a valid https URL`);
    }

    return normalized;
  }

  private normalizeOptionalHeight(value: unknown, path: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > EMBED_HEIGHT_MAX) {
      throw new BadRequestException(`${path} must be an integer between 1 and ${EMBED_HEIGHT_MAX}`);
    }

    return value;
  }

  private async assertAppReferencesExist(app: AppConfig): Promise<void> {
    const entityIds = app.items
      .filter((item): item is AppEntityItemConfig => item.kind === 'entity')
      .map((item) => item.entityId);
    const resourceIds = app.items.flatMap((item) => ('resourceId' in item && item.resourceId ? [item.resourceId] : []));

    await this.appsAdminConfigRepository.assertEntityIdsExist(entityIds);
    await this.appsAdminConfigRepository.assertResourceIdsExist(resourceIds);
    await this.appsAdminConfigRepository.assertPermissionCodesExist(app.permissionCodes);
  }

  private assertPageTargetsExist(items: AppItemConfig[]): void {
    const itemIds = new Set(items.map((item) => item.id));

    for (const item of items) {
      if (item.kind !== 'home' && item.kind !== 'custom-page') {
        continue;
      }

      for (const block of item.page.blocks) {
        const actions = block.type === 'link-list'
          ? block.links
          : block.type === 'hero' && block.action
            ? [block.action]
            : [];

        for (const action of actions) {
          if (action.targetType === 'app-item' && !itemIds.has(action.target)) {
            throw new BadRequestException(
              `app item ${item.id} references unknown app-item target ${action.target}`,
            );
          }
        }
      }
    }
  }

  private assertIframeHostsAllowed(items: AppItemConfig[]): void {
    const allowedHosts = new Set(readAllowedAppEmbedHosts(this.configService));

    for (const item of items) {
      if (
        (item.kind !== 'external-link' && item.kind !== 'report') ||
        item.openMode !== 'iframe'
      ) {
        continue;
      }

      const host = extractHostFromHttpsUrl(item.url);
      if (!host || !allowedHosts.has(host)) {
        throw new BadRequestException(
          `app item ${item.id} iframe host must be listed in APP_EMBED_ALLOWED_HOSTS`,
        );
      }
    }
  }

  private buildAppAuditMetadata(app: AppConfig): Record<string, unknown> {
    const itemsByKind = app.items.reduce<Record<string, number>>((counts, item) => {
      counts[item.kind] = (counts[item.kind] ?? 0) + 1;
      return counts;
    }, {});

    return {
      itemCount: app.items.length,
      entityCount: app.items.filter((item) => item.kind === 'entity').length,
      permissionCount: app.permissionCodes.length,
      sortOrder: app.sortOrder,
      itemsByKind
    };
  }

  private requireArray(value: unknown, message: string): unknown[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(message);
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

  private requireKebabCaseString(value: unknown, fieldName: string): string {
    const normalized = this.requireString(value, `${fieldName} is required`);
    this.resourceAccessService.assertKebabCaseId(normalized, fieldName);
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
