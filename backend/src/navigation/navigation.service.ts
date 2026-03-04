import { Injectable } from '@nestjs/common';

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
    const routes = this.aclService.listResourcesByType('route');

    const items = routes
      .filter((resource) => this.aclService.canAccess(user.permissions, resource.id))
      .map((resource) => ({
        id: resource.id,
        target: resource.target ?? '/',
        description: resource.description ?? resource.id
      }));

    return { items };
  }
}
