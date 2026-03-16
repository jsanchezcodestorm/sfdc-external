import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AclService } from '../acl/acl.service';
import type { SessionUser } from '../auth/session-user.interface';
import { SalesforceService } from '../salesforce/salesforce.service';

import { AppsAdminConfigRepository } from './apps-admin-config.repository';
import type {
  AppsAvailableResponse,
  AvailableApp,
  AvailableAppEntityItem,
  AvailableAppItem
} from './apps.types';

const DEFAULT_KEY_PREFIX_LOOKUP_TIMEOUT_MS = 1500;

@Injectable()
export class AppsService {
  private readonly logger = new Logger(AppsService.name);
  private readonly keyPrefixLookupTimeoutMs: number;

  constructor(
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly aclService: AclService,
    private readonly salesforceService: SalesforceService,
    configService: ConfigService
  ) {
    this.keyPrefixLookupTimeoutMs = this.readPositiveIntConfig(
      configService,
      'APPS_AVAILABLE_KEY_PREFIX_TIMEOUT_MS',
      DEFAULT_KEY_PREFIX_LOOKUP_TIMEOUT_MS
    );
  }

  async listAvailableApps(user: SessionUser): Promise<AppsAvailableResponse> {
    const permissions = this.aclService.normalizePermissions(user.permissions);
    const items = await this.appsAdminConfigRepository.listAvailableApps(permissions);
    const visibleApps = items
      .map((app) => ({
        ...app,
        items: app.items.filter((item) => this.canAccessAppItem(user.permissions, item))
      }))
      .filter((app) => app.items.length > 0);

    return {
      items: await this.attachEntityKeyPrefixes(visibleApps)
    };
  }

  private canAccessAppItem(userPermissions: string[], item: AvailableAppItem): boolean {
    if (item.kind === 'home') {
      return true;
    }

    const passesItemResource = !item.resourceId || this.aclService.canAccess(userPermissions, item.resourceId);
    if (!passesItemResource) {
      return false;
    }

    if (item.kind !== 'entity') {
      return true;
    }

    return this.aclService.canAccess(userPermissions, `entity:${item.entityId}`);
  }

  private async attachEntityKeyPrefixes(apps: AvailableApp[]): Promise<AvailableApp[]> {
    const keyPrefixesByObjectApiName = new Map<string, string | undefined>();
    const objectApiNames = [
      ...new Set(
        apps
          .flatMap((app) =>
            app.items
              .filter((item): item is AvailableAppEntityItem => item.kind === 'entity')
              .map((item) => item.objectApiName.trim())
          )
          .filter((objectApiName) => objectApiName.length > 0)
      )
    ];

    await Promise.all(
      objectApiNames.map(async (objectApiName) => {
        keyPrefixesByObjectApiName.set(
          objectApiName,
          await this.resolveKeyPrefixForObject(objectApiName)
        );
      })
    );

    return apps.map((app) => ({
      ...app,
      items: app.items.map((item) =>
        item.kind === 'entity'
          ? this.attachKeyPrefixToEntity(item, keyPrefixesByObjectApiName.get(item.objectApiName.trim()))
          : item
      )
    }));
  }

  private attachKeyPrefixToEntity(
    item: AvailableAppEntityItem,
    keyPrefix: string | undefined
  ): AvailableAppEntityItem {
    if (!keyPrefix) {
      return item;
    }

    return {
      ...item,
      keyPrefix
    };
  }

  private async resolveKeyPrefixForObject(objectApiName: string): Promise<string | undefined> {
    try {
      const describe = await this.withTimeout(
        this.salesforceService.describeObject(objectApiName),
        this.keyPrefixLookupTimeoutMs,
        `Timed out resolving keyPrefix for ${objectApiName}`
      );
      return this.readKeyPrefix(describe);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Unable to resolve keyPrefix for ${objectApiName}: ${message}`);
      return undefined;
    }
  }

  private readKeyPrefix(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const keyPrefix = (value as Record<string, unknown>).keyPrefix;
    return typeof keyPrefix === 'string' && keyPrefix.trim().length > 0 ? keyPrefix.trim() : undefined;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      void promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        }
      );
    });
  }

  private readPositiveIntConfig(configService: ConfigService, configKey: string, fallback: number): number {
    const rawValue = configService.get<string>(configKey);
    if (!rawValue) {
      return fallback;
    }

    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
