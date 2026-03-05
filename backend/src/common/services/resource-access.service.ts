import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { AclService } from '../../acl/acl.service';
import type { SessionUser } from '../../auth/session-user.interface';
import { VisibilityService } from '../../visibility/visibility.service';
import type { VisibilityEvaluation } from '../../visibility/visibility.types';

const RESOURCE_ID_PATTERN = /^[a-z0-9-]+$/;

@Injectable()
export class ResourceAccessService {
  constructor(
    private readonly aclService: AclService,
    private readonly visibilityService: VisibilityService
  ) {}

  assertKebabCaseId(value: string, fieldName: string): void {
    if (!RESOURCE_ID_PATTERN.test(value)) {
      throw new BadRequestException(`${fieldName} must be lowercase kebab-case`);
    }
  }

  async authorizeObjectAccess(
    user: SessionUser,
    aclResourceId: string,
    objectApiName: string
  ): Promise<VisibilityEvaluation> {
    if (!this.aclService.canAccess(user.permissions, aclResourceId)) {
      throw new ForbiddenException(`ACL denied ${aclResourceId}`);
    }

    const visibility = await this.visibilityService.evaluateForObject(user, objectApiName);

    if (visibility.decision === 'DENY') {
      throw new ForbiddenException(`Visibility denied (${visibility.reasonCode}) for ${objectApiName}`);
    }

    return visibility;
  }
}
