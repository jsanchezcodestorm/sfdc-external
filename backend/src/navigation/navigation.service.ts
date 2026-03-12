import { Injectable } from '@nestjs/common';
import { KNOWN_ROUTE_DEFINITIONS } from '@sfdc-external/shared';

import { AclService } from '../acl/acl.service';
import type { SessionUser } from '../auth/session-user.interface';

interface NavigationItem {
  id: string;
  target: string;
  description: string;
}

@Injectable()
export class NavigationService {
  constructor(private readonly aclService: AclService) {}

  getNavigation(user: SessionUser): { items: NavigationItem[] } {
    const items = KNOWN_ROUTE_DEFINITIONS
      .filter((route) => this.aclService.canAccess(user.permissions, route.id))
      .map((route) => ({
        id: route.id,
        target: route.path,
        description: route.description
      }));

    return { items };
  }
}
