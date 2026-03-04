import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';

import { AclService } from '../acl/acl.service';
import type { SessionUser } from '../auth/session-user.interface';
import { resolveConfigFile } from '../common/utils/config-path.util';
import { VisibilityService } from '../visibility/visibility.service';

interface EntityConfig {
  id: string;
  objectApiName: string;
  [key: string]: unknown;
}

@Injectable()
export class EntitiesService {
  constructor(
    private readonly aclService: AclService,
    private readonly visibilityService: VisibilityService
  ) {}

  async getEntity(user: SessionUser, entityId: string): Promise<{ entity: EntityConfig; visibility: unknown }> {
    this.assertEntityId(entityId);

    if (!this.aclService.canAccess(user.permissions, `entity:${entityId}`)) {
      throw new ForbiddenException(`ACL denied entity:${entityId}`);
    }

    const entityConfig = this.loadEntityConfig(entityId);
    const visibility = await this.visibilityService.evaluateForObject(user, entityConfig.objectApiName);

    if (visibility.decision === 'DENY') {
      throw new ForbiddenException(`Visibility denied (${visibility.reasonCode}) for ${entityConfig.objectApiName}`);
    }

    return {
      entity: entityConfig,
      visibility
    };
  }

  private loadEntityConfig(entityId: string): EntityConfig {
    const path = resolveConfigFile(`entities/${entityId}.json`);

    if (!path) {
      throw new NotFoundException(`Entity config not found for ${entityId}`);
    }

    const parsed = JSON.parse(readFileSync(path, 'utf8')) as EntityConfig;

    if (!parsed.objectApiName) {
      throw new BadRequestException(`Entity config for ${entityId} is invalid: objectApiName is required`);
    }

    return parsed;
  }

  private assertEntityId(entityId: string): void {
    if (!/^[a-z0-9-]+$/.test(entityId)) {
      throw new BadRequestException('entityId must be lowercase kebab-case');
    }
  }
}
