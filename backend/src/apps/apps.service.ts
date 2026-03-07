import { Injectable } from '@nestjs/common';

import { AclService } from '../acl/acl.service';
import type { SessionUser } from '../auth/session-user.interface';

import { AppsAdminConfigRepository } from './apps-admin-config.repository';
import type { AppsAvailableResponse } from './apps.types';

@Injectable()
export class AppsService {
  constructor(
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly aclService: AclService
  ) {}

  async listAvailableApps(user: SessionUser): Promise<AppsAvailableResponse> {
    const permissions = this.aclService.normalizePermissions(user.permissions);
    const items = await this.appsAdminConfigRepository.listAvailableApps(permissions);

    return {
      items: items
        .map((app) => ({
          ...app,
          entities: app.entities.filter((entity) =>
            this.aclService.canAccess(user.permissions, `entity:${entity.id}`)
          )
        }))
        .filter((app) => app.entities.length > 0)
    };
  }
}
