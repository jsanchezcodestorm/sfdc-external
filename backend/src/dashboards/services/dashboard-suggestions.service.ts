import { Injectable } from '@nestjs/common';

import { AclConfigRepository } from '../../acl/acl-config.repository';
import type { SessionUser } from '../../auth/session-user.interface';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesforceService } from '../../salesforce/salesforce.service';
import type {
  DashboardFieldSuggestionResponse,
  DashboardSourceReportSuggestionResponse
} from '../dashboards.types';
import { DashboardAccessPolicyService } from './dashboard-access-policy.service';
import { DashboardAppConfigService } from './dashboard-app-config.service';
import { DashboardDefinitionValidatorService } from './dashboard-definition-validator.service';
import { DashboardRecordsRepository } from './dashboard-records.repository';
import { DashboardValueService } from './dashboard-value.service';

@Injectable()
export class DashboardSuggestionsService {
  constructor(
    private readonly appConfigService: DashboardAppConfigService,
    private readonly prismaService: PrismaService,
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly salesforceService: SalesforceService,
    private readonly dashboardRecordsRepository: DashboardRecordsRepository,
    private readonly accessPolicy: DashboardAccessPolicyService,
    private readonly definitionValidator: DashboardDefinitionValidatorService,
    private readonly valueService: DashboardValueService
  ) {}

  async searchContacts(_user: SessionUser, appId: string, query: string, limit: number | undefined) {
    await this.appConfigService.assertAppExists(appId);
    return {
      items: await this.salesforceService.searchContactsByIdOrName(query, limit ?? 8)
    };
  }

  async searchPermissions(_user: SessionUser, appId: string, query: string, limit: number | undefined) {
    await this.appConfigService.assertAppExists(appId);
    const snapshot = await this.aclConfigRepository.loadSnapshot();
    const normalizedQuery = query.trim().toLowerCase();
    const maxItems = this.valueService.clamp(limit ?? 12, 1, 25);

    return {
      items: snapshot.permissions
        .filter((permission) =>
          permission.code.toLowerCase().includes(normalizedQuery) ||
          (permission.label?.toLowerCase().includes(normalizedQuery) ?? false)
        )
        .slice(0, maxItems)
        .map((permission) => ({
          code: permission.code,
          label: permission.label
        }))
    };
  }

  async searchSourceReports(
    user: SessionUser,
    appId: string,
    query: string,
    limit: number | undefined
  ): Promise<DashboardSourceReportSuggestionResponse> {
    await this.appConfigService.assertAppExists(appId);
    const normalizedQuery = query.trim().toLowerCase();
    const maxItems = this.valueService.clamp(limit ?? 20, 1, 25);
    const reports = await this.prismaService.reportDefinitionRecord.findMany({
      where: { appId },
      include: {
        shares: true,
        folder: {
          include: {
            shares: true
          }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { label: 'asc' }]
    });

    return {
      items: reports
        .filter((report) => this.accessPolicy.canAccessSourceReport(user, report))
        .filter((report) =>
          report.label.toLowerCase().includes(normalizedQuery) ||
          report.objectApiName.toLowerCase().includes(normalizedQuery) ||
          report.folder.label.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, maxItems)
        .map((report) => ({
          id: report.id,
          label: report.label,
          folderId: report.folderId,
          folderLabel: report.folder.label,
          objectApiName: report.objectApiName,
          updatedAt: report.updatedAt.toISOString()
        }))
    };
  }

  async searchSourceReportFields(
    user: SessionUser,
    appId: string,
    reportId: string,
    query: string | undefined,
    limit: number | undefined
  ): Promise<DashboardFieldSuggestionResponse> {
    await this.appConfigService.assertAppExists(appId);
    const sourceReport = await this.dashboardRecordsRepository.getSourceReportOrThrow(appId, reportId);
    this.accessPolicy.assertCanUseSourceReport(user, sourceReport);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      'rest:dashboards-write',
      sourceReport.objectApiName,
      {
        queryKind: 'DASHBOARD_CONFIG'
      }
    );
    const visibleFieldMap = await this.definitionValidator.buildVisibleFieldMetadataMap(sourceReport.objectApiName, visibility);
    const normalizedQuery = query?.trim().toLowerCase() ?? '';
    const maxItems = this.valueService.clamp(limit ?? 25, 1, 50);

    return {
      items: [...visibleFieldMap.values()]
        .filter((field) =>
          normalizedQuery.length === 0 ||
          field.name.toLowerCase().includes(normalizedQuery) ||
          field.label.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, maxItems)
        .map((field) => ({
          name: field.name,
          label: field.label,
          type: field.type,
          filterable: field.filterable
        }))
    };
  }
}
