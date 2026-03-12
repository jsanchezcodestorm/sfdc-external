import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { AclService } from '../../acl/acl.service';
import { AuditWriteService } from '../../audit/audit-write.service';
import type { SessionUser } from '../../auth/session-user.interface';
import { VisibilityService } from '../../visibility/visibility.service';
import type { VisibilityEvaluation } from '../../visibility/visibility.types';

const RESOURCE_ID_PATTERN = /^[a-z0-9-]+$/;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

@Injectable()
export class ResourceAccessService {
  constructor(
    private readonly aclService: AclService,
    private readonly visibilityService: VisibilityService,
    private readonly auditWriteService: AuditWriteService
  ) {}

  assertKebabCaseId(value: string, fieldName: string): void {
    if (!RESOURCE_ID_PATTERN.test(value)) {
      throw new BadRequestException(`${fieldName} must be lowercase kebab-case`);
    }
  }

  assertEntityId(value: string, fieldName: string): void {
    if (!ENTITY_ID_PATTERN.test(value)) {
      throw new BadRequestException(
        `${fieldName} must contain only letters, numbers, underscores, or hyphens`
      );
    }
  }

  async authorizeObjectAccess(
    user: SessionUser,
    aclResourceId: string,
    objectApiName: string,
    auditContext: {
      queryKind: string;
      baseWhere?: string;
    }
  ): Promise<VisibilityEvaluation> {
    if (!this.aclService.canAccess(user.permissions, aclResourceId)) {
      await this.auditWriteService.recordSecurityEventOrThrow({
        contactId: user.sub,
        eventType: 'ACL',
        decision: 'DENY',
        reasonCode: 'ACL_DENIED',
        metadata: {
          resourceId: aclResourceId
        }
      });
      throw new ForbiddenException(`ACL denied ${aclResourceId}`);
    }

    const visibility = await this.visibilityService.evaluateForObject(user, objectApiName);

    if (visibility.decision === 'DENY') {
      await this.visibilityService.recordAudit({
        evaluation: visibility,
        queryKind: auditContext.queryKind,
        baseWhere: auditContext.baseWhere,
        finalWhere: visibility.finalWhere,
        rowCount: 0,
        durationMs: 0
      });
      throw new ForbiddenException(`Visibility denied (${visibility.reasonCode}) for ${objectApiName}`);
    }

    return visibility;
  }
}
