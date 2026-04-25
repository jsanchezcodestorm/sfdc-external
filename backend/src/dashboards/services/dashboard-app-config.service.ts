import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AppsAdminConfigRepository } from '../../apps/apps-admin-config.repository';
import { ResourceAccessService } from '../../common/services/resource-access.service';

@Injectable()
export class DashboardAppConfigService {
  constructor(
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly resourceAccessService: ResourceAccessService
  ) {}

  async assertAppExists(appId: string): Promise<void> {
    this.resourceAccessService.assertKebabCaseId(appId, 'appId');
    if (!(await this.appsAdminConfigRepository.hasApp(appId))) {
      throw new NotFoundException(`App config ${appId} not found`);
    }
  }

  async assertDashboardNotReferencedByHome(appId: string, dashboardId: string): Promise<void> {
    const app = await this.appsAdminConfigRepository.getApp(appId);
    const home = app.items.find((item) => item.kind === 'home');
    const isReferenced = home?.page.blocks.some(
      (block) => block.type === 'dashboard' && block.dashboardId === dashboardId
    );

    if (isReferenced) {
      throw new ConflictException(`Dashboard ${dashboardId} is referenced by app home ${appId}`);
    }
  }
}
