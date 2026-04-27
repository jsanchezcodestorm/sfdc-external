import { BadRequestException, Injectable } from '@nestjs/common';

import { AppsAdminConfigRepository } from '../../apps/apps-admin-config.repository';
import { AppsAdminService } from '../../apps/apps-admin.service';
import { EntityAdminConfigRepository } from '../../entities/services/entity-admin-config.repository';
import { EntityAdminConfigService } from '../../entities/services/entity-admin-config.service';
import { QueryAdminTemplateRepository } from '../../query/services/query-admin-template.repository';
import { QueryAdminTemplateService } from '../../query/services/query-admin-template.service';
import { QueryTemplateRepository } from '../../query/services/query-template.repository';
import type { DeployableMetadataTypeName } from '../metadata.types';
import type { ParsedPackageEntry } from './metadata-package-codec.service';

@Injectable()
export class MetadataBasicApplierService {
  constructor(
    private readonly entityAdminConfigRepository: EntityAdminConfigRepository,
    private readonly entityAdminConfigService: EntityAdminConfigService,
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly appsAdminService: AppsAdminService,
    private readonly queryAdminTemplateRepository: QueryAdminTemplateRepository,
    private readonly queryAdminTemplateService: QueryAdminTemplateService,
    private readonly queryTemplateRepository: QueryTemplateRepository,
  ) {}

  async applyEntityEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    for (const entry of entries) {
      const normalizedEntity = this.entityAdminConfigService.normalizeEntityConfigForPersistence(
        entry.member,
        entry.parsedData,
      );
      await this.entityAdminConfigRepository.upsertEntityConfig(normalizedEntity);
    }

    if (entries.length > 0) {
      appliedCounts.set('EntityConfig', entries.length);
    }
  }

  async applyQueryTemplateEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    for (const entry of entries) {
      const template = this.queryAdminTemplateService.normalizeTemplateForPersistence(entry.parsedData);
      if (template.id !== entry.member) {
        throw new BadRequestException(`${entry.path} template.id must match file name`);
      }

      await this.queryAdminTemplateRepository.upsertTemplate(template);
      this.queryTemplateRepository.evictTemplate(template.id);
    }

    if (entries.length > 0) {
      appliedCounts.set('QueryTemplate', entries.length);
    }
  }

  async applyAppEntries(
    entries: ParsedPackageEntry[],
    appliedCounts: Map<DeployableMetadataTypeName, number>,
  ): Promise<void> {
    for (const entry of entries) {
      const app = await this.appsAdminService.normalizeAppForPersistence(entry.member, entry.parsedData);
      await this.appsAdminConfigRepository.upsertApp(app);
    }

    if (entries.length > 0) {
      appliedCounts.set('AppConfig', entries.length);
    }
  }
}
