import { Injectable, Logger } from '@nestjs/common';

import { AclService } from '../acl/acl.service';
import type { SessionUser } from '../auth/session-user.interface';
import { SalesforceService } from '../salesforce/salesforce.service';

import { AppsAdminConfigRepository } from './apps-admin-config.repository';
import type { AppsAvailableResponse, AvailableApp, AvailableAppEntity } from './apps.types';

@Injectable()
export class AppsService {
  private readonly logger = new Logger(AppsService.name);

  constructor(
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly aclService: AclService,
    private readonly salesforceService: SalesforceService
  ) {}

  async listAvailableApps(user: SessionUser): Promise<AppsAvailableResponse> {
    const permissions = this.aclService.normalizePermissions(user.permissions);
    const items = await this.appsAdminConfigRepository.listAvailableApps(permissions);
    const visibleApps = items
      .map((app) => ({
        ...app,
        entities: app.entities.filter((entity) =>
          this.aclService.canAccess(user.permissions, `entity:${entity.id}`)
        )
      }))
      .filter((app) => app.entities.length > 0);

    return {
      items: await this.attachEntityKeyPrefixes(visibleApps)
    };
  }

  private async attachEntityKeyPrefixes(apps: AvailableApp[]): Promise<AvailableApp[]> {
    const keyPrefixesByObjectApiName = new Map<string, string | undefined>();
    const objectApiNames = [
      ...new Set(
        apps
          .flatMap((app) => app.entities.map((entity) => entity.objectApiName.trim()))
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
      entities: app.entities.map((entity) =>
        this.attachKeyPrefixToEntity(entity, keyPrefixesByObjectApiName.get(entity.objectApiName.trim()))
      )
    }));
  }

  private attachKeyPrefixToEntity(
    entity: AvailableAppEntity,
    keyPrefix: string | undefined
  ): AvailableAppEntity {
    if (!keyPrefix) {
      return entity;
    }

    return {
      ...entity,
      keyPrefix
    };
  }

  private async resolveKeyPrefixForObject(objectApiName: string): Promise<string | undefined> {
    try {
      const describe = await this.salesforceService.describeObject(objectApiName);
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
}
