import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AclService } from '../../acl/acl.service';
import { ACL_METADATA_KEY } from '../../app.constants';
import type { SessionUser } from '../../auth/session-user.interface';

@Injectable()
export class AclGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly aclService: AclService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const resourceId = this.reflector.getAllAndOverride<string | undefined>(ACL_METADATA_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!resourceId) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: SessionUser }>();

    if (!request.user) {
      throw new UnauthorizedException('Authenticated session required');
    }

    if (!this.aclService.canAccess(request.user.permissions, resourceId)) {
      throw new ForbiddenException(`ACL denied resource ${resourceId}`);
    }

    return true;
  }
}
