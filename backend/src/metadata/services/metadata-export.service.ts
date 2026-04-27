import { Injectable } from '@nestjs/common';

import { AclConfigRepository } from '../../acl/acl-config.repository';
import { AclContactPermissionsRepository } from '../../acl/acl-contact-permissions.repository';
import { AppsAdminConfigRepository } from '../../apps/apps-admin-config.repository';
import { AuthProviderAdminRepository } from '../../auth/auth-provider-admin.repository';
import { LocalCredentialAdminService } from '../../auth/local-credential-admin.service';
import { EntityAdminConfigRepository } from '../../entities/services/entity-admin-config.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAdminTemplateRepository } from '../../query/services/query-admin-template.repository';
import type { MetadataTypeName } from '../metadata.types';
import {
  type ExportEntry,
  MANUAL_LOCAL_CREDENTIAL_REASON,
  normalizeEmail,
} from './metadata-common';
import { MetadataEntryNormalizerService } from './metadata-entry-normalizer.service';
import { MetadataResolutionService } from './metadata-resolution.service';

@Injectable()
export class MetadataExportService {
  constructor(
    private readonly entityAdminConfigRepository: EntityAdminConfigRepository,
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly aclContactPermissionsRepository: AclContactPermissionsRepository,
    private readonly queryAdminTemplateRepository: QueryAdminTemplateRepository,
    private readonly authProviderAdminRepository: AuthProviderAdminRepository,
    private readonly localCredentialAdminService: LocalCredentialAdminService,
    private readonly prisma: PrismaService,
    private readonly entryNormalizer: MetadataEntryNormalizerService,
    private readonly resolution: MetadataResolutionService,
  ) {}

  async loadEntriesForType(typeName: MetadataTypeName): Promise<ExportEntry[]> {
    switch (typeName) {
      case 'EntityConfig': {
        const summaries = await this.entityAdminConfigRepository.listSummaries();
        return Promise.all(
          summaries.map(async (summary) => ({
            member: summary.id,
            data: await this.entityAdminConfigRepository.getEntityConfig(summary.id),
          })),
        );
      }
      case 'AppConfig': {
        const summaries = await this.appsAdminConfigRepository.listSummaries();
        return Promise.all(
          summaries.map(async (summary) => ({
            member: summary.id,
            data: await this.appsAdminConfigRepository.getApp(summary.id),
          })),
        );
      }
      case 'AclPermission': {
        const snapshot = await this.aclConfigRepository.loadSnapshot();
        return snapshot.permissions.map((permission) => ({
          member: permission.code,
          data: permission,
        }));
      }
      case 'AclResource': {
        const snapshot = await this.aclConfigRepository.loadSnapshot();
        return snapshot.resources.map((resource) => ({
          member: resource.id,
          data: resource,
        }));
      }
      case 'AclDefaultPermission': {
        const snapshot = await this.aclConfigRepository.loadSnapshot();
        return snapshot.defaultPermissions.map((permissionCode) => ({
          member: permissionCode,
          data: {
            permissionCode,
          },
        }));
      }
      case 'AclContactPermission': {
        const rows = await this.aclContactPermissionsRepository.listRows();
        const grouped = new Map<string, string[]>();
        const context = this.resolution.createContext();

        for (const row of rows) {
          const existing = grouped.get(row.contactId) ?? [];
          existing.push(row.permissionCode);
          grouped.set(row.contactId, existing);
        }

        return Promise.all(
          [...grouped.entries()].map(async ([contactId, permissionCodes]) => {
            const contactRef = await this.resolution.resolveExportContactReference(contactId, context);
            return {
              member: contactRef.email,
              data: {
                contactRef,
                permissionCodes,
              },
            };
          }),
        );
      }
      case 'QueryTemplate': {
        const summaries = await this.queryAdminTemplateRepository.listSummaries();
        return Promise.all(
          summaries.map(async (summary) => ({
            member: summary.id,
            data: await this.queryAdminTemplateRepository.getTemplate(summary.id),
          })),
        );
      }
      case 'VisibilityCone': {
        const rows = await this.prisma.visibilityCone.findMany({
          orderBy: [{ code: 'asc' }],
        });
        return rows.map((row) => ({
          member: row.code,
          data: {
            code: row.code,
            name: row.name,
            priority: row.priority,
            active: row.active,
          },
        }));
      }
      case 'VisibilityRule': {
        const rows = await this.prisma.visibilityRule.findMany({
          orderBy: [{ id: 'asc' }],
          include: {
            cone: true,
          },
        });
        return rows.map((row) => ({
          member: row.id,
          data: {
            id: row.id,
            coneCode: row.cone.code,
            objectApiName: row.objectApiName,
            description: row.description ?? undefined,
            effect: row.effect,
            condition: row.conditionJson,
            fieldsAllowed: Array.isArray(row.fieldsAllowed) ? row.fieldsAllowed : undefined,
            fieldsDenied: Array.isArray(row.fieldsDenied) ? row.fieldsDenied : undefined,
            active: row.active,
          },
        }));
      }
      case 'VisibilityAssignment': {
        const rows = await this.prisma.visibilityAssignment.findMany({
          orderBy: [{ id: 'asc' }],
          include: {
            cone: true,
          },
        });
        const context = this.resolution.createContext();
        return Promise.all(
          rows.map(async (row) => ({
            member: row.id,
            data: {
              id: row.id,
              coneCode: row.cone.code,
              contactRef: row.contactId
                ? await this.resolution.resolveExportContactReference(row.contactId, context)
                : undefined,
              permissionCode: row.permissionCode ?? undefined,
              recordType: row.recordType ?? undefined,
              validFrom: row.validFrom?.toISOString(),
              validTo: row.validTo?.toISOString(),
            },
          })),
        );
      }
      case 'AuthProvider': {
        const rows = await this.authProviderAdminRepository.listConfigs();
        return rows.map((row) => ({
          member: row.providerId,
          data: this.entryNormalizer.buildManualAuthProviderRecord(row),
        }));
      }
      case 'LocalCredential': {
        const response = await this.localCredentialAdminService.listCredentials();
        return response.items.map((item) => {
          const email = normalizeEmail(
            item.contactEmail,
            `Local credential ${item.contactId} is missing a Contact email`,
          );
          return {
            member: email,
            data: {
              contactRef: {
                email,
                sourceId: item.contactId,
              },
              username: item.username,
              enabled: item.enabled,
              reason: MANUAL_LOCAL_CREDENTIAL_REASON,
            },
          };
        });
      }
    }
  }
}
