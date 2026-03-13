import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ReportFolderAccessMode,
  ReportShareMode,
  ReportShareSubjectType,
  type Prisma
} from '@prisma/client';

import { AclConfigRepository } from '../acl/acl-config.repository';
import { AclService } from '../acl/acl.service';
import { AppsAdminConfigRepository } from '../apps/apps-admin-config.repository';
import { AuditWriteService } from '../audit/audit-write.service';
import { QueryAuditService } from '../audit/query-audit.service';
import type { SessionUser } from '../auth/session-user.interface';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ReportColumn,
  ReportFilter,
  ReportScalarValue,
  ReportShareGrant,
  ReportSort
} from '../reports/reports.types';
import { ReportSoqlBuilderService } from '../reports/services/report-soql-builder.service';
import { SalesforceService } from '../salesforce/salesforce.service';

import type {
  DashboardAppliedFilter,
  DashboardChartWidgetDefinition,
  DashboardDefinition,
  DashboardFieldSuggestionResponse,
  DashboardFilterDefinition,
  DashboardFilterOption,
  DashboardFilterRuntimeState,
  DashboardFolderResponse,
  DashboardFolderSummary,
  DashboardKpiWidgetDefinition,
  DashboardMetricDefinition,
  DashboardResponse,
  DashboardRunChartWidget,
  DashboardRunKpiWidget,
  DashboardRunResponse,
  DashboardRunTableGroupedWidget,
  DashboardRunTableRow,
  DashboardRunTableRowsWidget,
  DashboardRunWidget,
  DashboardSourceReportSuggestionResponse,
  DashboardSummary,
  DashboardTableGroupedWidgetDefinition,
  DashboardTableRowsWidgetDefinition,
  DashboardWidgetDefinition,
  DashboardsWorkspaceResponse,
  DashboardRuntimeReportContext,
  DashboardFieldSuggestion,
  UpsertDashboardDefinitionInput,
  UpsertDashboardFolderInput
} from './dashboards.types';

const MAX_DASHBOARD_FILTERS = 3;
const MAX_DASHBOARD_WIDGETS = 12;
const MAX_WIDGET_LIMIT = 50;
const FILTER_OPTIONS_LIMIT = 100;
const GRID_COLUMNS = 12;
const SALESFORCE_ID_PATTERN = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_FIELD_TYPES = new Set(['int', 'double', 'currency', 'percent', 'number', 'long']);

type SourceReportRecord = Prisma.ReportDefinitionRecordGetPayload<{
  include: {
    shares: true;
    folder: {
      include: {
        shares: true;
      };
    };
  };
}>;

type DashboardFolderRecordWithRelations = Prisma.DashboardFolderRecordGetPayload<{
  include: {
    shares: true;
    dashboards: {
      include: {
        shares: true;
        sourceReport: {
          include: {
            shares: true;
            folder: {
              include: {
                shares: true;
              };
            };
          };
        };
      };
      orderBy: {
        updatedAt: 'desc';
      };
    };
  };
}>;

type DashboardRecordWithRelations = Prisma.DashboardDefinitionRecordGetPayload<{
  include: {
    shares: true;
    folder: {
      include: {
        shares: true;
        dashboards: {
          include: {
            shares: true;
          };
          orderBy: {
            updatedAt: 'desc';
          };
        };
      };
    };
    sourceReport: {
      include: {
        shares: true;
        folder: {
          include: {
            shares: true;
          };
        };
      };
    };
  };
}>;

interface DashboardGrantEnvelope {
  ownerOnly: boolean;
  allowedGrantKeys: Set<string>;
}

interface DashboardFieldMetadata {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly queryAuditService: QueryAuditService,
    private readonly salesforceService: SalesforceService,
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly aclService: AclService,
    private readonly auditWriteService: AuditWriteService,
    private readonly reportSoqlBuilderService: ReportSoqlBuilderService
  ) {}

  async getWorkspace(user: SessionUser, appId: string): Promise<DashboardsWorkspaceResponse> {
    await this.assertAppExists(appId);
    const folders = await this.listFoldersWithDashboards(appId);

    return {
      appId,
      canWrite: this.canWriteDashboards(user),
      folders: folders
        .filter((folder) => this.canAccessDashboardFolder(user, folder))
        .map((folder) => this.mapFolderSummary(user, folder))
    };
  }

  async getFolder(user: SessionUser, appId: string, folderId: string): Promise<DashboardFolderResponse> {
    await this.assertAppExists(appId);
    const folder = await this.getFolderOrThrow(appId, folderId);
    this.assertCanViewDashboardFolder(user, folder);

    return {
      canWrite: this.canWriteDashboards(user),
      folder: this.mapFolderSummary(user, folder),
      dashboards: folder.dashboards
        .filter((dashboard) => this.canAccessDashboard(user, folder, dashboard))
        .map((dashboard) => this.mapDashboardSummary(user, dashboard))
    };
  }

  async createFolder(user: SessionUser, appId: string, payload: unknown): Promise<DashboardFolderResponse> {
    await this.assertAppExists(appId);
    const normalized = this.normalizeFolderInput(payload);

    const created = await this.prismaService.dashboardFolderRecord.create({
      data: {
        appId,
        label: normalized.label,
        description: normalized.description ?? null,
        ownerContactId: user.sub,
        accessMode: this.toFolderAccessMode(normalized.accessMode),
        shares: normalized.accessMode === 'shared'
          ? {
              createMany: {
                data: normalized.shares.map((share) => ({
                  subjectType: this.toShareSubjectType(share.subjectType),
                  subjectId: share.subjectId
                }))
              }
            }
          : undefined
      },
      include: {
        shares: true,
        dashboards: {
          include: {
            shares: true,
            sourceReport: {
              include: {
                shares: true,
                folder: {
                  include: {
                    shares: true
                  }
                }
              }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'DASHBOARD_FOLDER_CREATE',
      targetType: 'dashboard-folder',
      targetId: created.id,
      payload,
      metadata: {
        appId,
        ownerContactId: user.sub,
        accessMode: normalized.accessMode,
        shareCount: normalized.shares.length
      }
    });

    return this.getFolder(user, appId, created.id);
  }

  async updateFolder(user: SessionUser, appId: string, folderId: string, payload: unknown): Promise<DashboardFolderResponse> {
    await this.assertAppExists(appId);
    const existing = await this.getFolderOrThrow(appId, folderId);
    this.assertCanManageDashboardFolder(user, existing);
    const normalized = this.normalizeFolderInput(payload);

    this.assertFolderScopeCompatibleWithDashboards(normalized, existing.dashboards);

    await this.prismaService.$transaction(async (tx) => {
      await tx.dashboardFolderRecord.update({
        where: { id: folderId },
        data: {
          label: normalized.label,
          description: normalized.description ?? null,
          accessMode: this.toFolderAccessMode(normalized.accessMode)
        }
      });

      await tx.dashboardFolderShareRecord.deleteMany({
        where: {
          folderId
        }
      });

      if (normalized.accessMode === 'shared' && normalized.shares.length > 0) {
        await tx.dashboardFolderShareRecord.createMany({
          data: normalized.shares.map((share) => ({
            folderId,
            subjectType: this.toShareSubjectType(share.subjectType),
            subjectId: share.subjectId
          }))
        });
      }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'DASHBOARD_FOLDER_UPDATE',
      targetType: 'dashboard-folder',
      targetId: folderId,
      payload,
      metadata: {
        appId,
        ownerContactId: existing.ownerContactId,
        accessMode: normalized.accessMode,
        shareCount: normalized.shares.length
      }
    });

    return this.getFolder(user, appId, folderId);
  }

  async deleteFolder(user: SessionUser, appId: string, folderId: string): Promise<void> {
    await this.assertAppExists(appId);
    const existing = await this.getFolderOrThrow(appId, folderId);
    this.assertCanManageDashboardFolder(user, existing);

    await this.prismaService.dashboardFolderRecord.delete({
      where: { id: folderId }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'DASHBOARD_FOLDER_DELETE',
      targetType: 'dashboard-folder',
      targetId: folderId,
      metadata: {
        appId,
        dashboardCount: existing.dashboards.length
      }
    });
  }

  async updateFolderShares(user: SessionUser, appId: string, folderId: string, sharesPayload: unknown[]): Promise<DashboardFolderResponse> {
    await this.assertAppExists(appId);
    const folder = await this.getFolderOrThrow(appId, folderId);
    this.assertCanManageDashboardFolder(user, folder);

    if (folder.accessMode !== ReportFolderAccessMode.SHARED) {
      throw new BadRequestException('Folder sharing can be updated only when accessMode is shared');
    }

    const shares = this.normalizeShareGrants(sharesPayload, 'shares');
    if (shares.length === 0) {
      throw new BadRequestException('Shared folder requires at least one share grant');
    }

    this.assertFolderScopeCompatibleWithDashboards(
      {
        label: folder.label,
        description: folder.description ?? undefined,
        accessMode: 'shared',
        shares
      },
      folder.dashboards
    );

    await this.prismaService.$transaction(async (tx) => {
      await tx.dashboardFolderShareRecord.deleteMany({
        where: { folderId }
      });
      await tx.dashboardFolderShareRecord.createMany({
        data: shares.map((share) => ({
          folderId,
          subjectType: this.toShareSubjectType(share.subjectType),
          subjectId: share.subjectId
        }))
      });
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'DASHBOARD_FOLDER_SHARES_UPDATE',
      targetType: 'dashboard-folder',
      targetId: folderId,
      payload: shares,
      metadata: {
        appId,
        shareCount: shares.length
      }
    });

    return this.getFolder(user, appId, folderId);
  }

  async getDashboard(user: SessionUser, appId: string, dashboardId: string): Promise<DashboardResponse> {
    await this.assertAppExists(appId);
    const dashboard = await this.getDashboardOrThrow(appId, dashboardId);
    this.assertCanViewDashboard(user, dashboard.folder, dashboard);

    return {
      canWrite: this.canWriteDashboards(user),
      dashboard: this.mapDashboardDefinition(user, dashboard)
    };
  }

  async createDashboard(user: SessionUser, appId: string, payload: unknown): Promise<DashboardResponse> {
    await this.assertAppExists(appId);
    const normalized = this.normalizeDashboardInput(payload);
    const folder = await this.getFolderOrThrow(appId, normalized.folderId);
    this.assertCanManageDashboardFolder(user, folder);
    const sourceReport = await this.getSourceReportOrThrow(appId, normalized.sourceReportId);
    this.assertCanUseSourceReport(user, sourceReport);
    await this.validateDashboardDefinition(user, sourceReport, normalized, normalized.folderId);

    const created = await this.prismaService.dashboardDefinitionRecord.create({
      data: {
        appId,
        folderId: normalized.folderId,
        sourceReportId: normalized.sourceReportId,
        label: normalized.label,
        description: normalized.description ?? null,
        ownerContactId: user.sub,
        filtersJson: normalized.filters as unknown as Prisma.InputJsonValue,
        widgetsJson: this.toWidgetsJson(normalized.widgets),
        layoutJson: this.toLayoutJson(normalized.widgets),
        shareMode: this.toShareMode(normalized.shareMode),
        shares: normalized.shareMode === 'restricted'
          ? {
              createMany: {
                data: normalized.shares.map((share) => ({
                  subjectType: this.toShareSubjectType(share.subjectType),
                  subjectId: share.subjectId
                }))
              }
            }
          : undefined
      },
      include: {
        shares: true,
        folder: {
          include: {
            shares: true,
            dashboards: {
              include: {
                shares: true
              },
              orderBy: {
                updatedAt: 'desc'
              }
            }
          }
        },
        sourceReport: {
          include: {
            shares: true,
            folder: {
              include: {
                shares: true
              }
            }
          }
        }
      }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'DASHBOARD_CREATE',
      targetType: 'dashboard-definition',
      targetId: created.id,
      payload,
      metadata: {
        appId,
        folderId: normalized.folderId,
        sourceReportId: normalized.sourceReportId,
        ownerContactId: user.sub,
        filterCount: normalized.filters.length,
        widgetCount: normalized.widgets.length,
        shareMode: normalized.shareMode,
        shareCount: normalized.shares.length
      }
    });

    return this.getDashboard(user, appId, created.id);
  }

  async updateDashboard(user: SessionUser, appId: string, dashboardId: string, payload: unknown): Promise<DashboardResponse> {
    await this.assertAppExists(appId);
    const existing = await this.getDashboardOrThrow(appId, dashboardId);
    this.assertCanManageDashboard(user, existing);
    const normalized = this.normalizeDashboardInput(payload, existing);
    const folder = await this.getFolderOrThrow(appId, normalized.folderId);
    this.assertCanManageDashboardFolder(user, folder);
    const sourceReport = await this.getSourceReportOrThrow(appId, normalized.sourceReportId);
    this.assertCanUseSourceReport(user, sourceReport);
    await this.validateDashboardDefinition(user, sourceReport, normalized, normalized.folderId);

    await this.prismaService.$transaction(async (tx) => {
      await tx.dashboardDefinitionRecord.update({
        where: { id: dashboardId },
        data: {
          folderId: normalized.folderId,
          label: normalized.label,
          description: normalized.description ?? null,
          filtersJson: normalized.filters as unknown as Prisma.InputJsonValue,
          widgetsJson: this.toWidgetsJson(normalized.widgets),
          layoutJson: this.toLayoutJson(normalized.widgets),
          shareMode: this.toShareMode(normalized.shareMode)
        }
      });

      await tx.dashboardDefinitionShareRecord.deleteMany({
        where: { dashboardId }
      });

      if (normalized.shareMode === 'restricted' && normalized.shares.length > 0) {
        await tx.dashboardDefinitionShareRecord.createMany({
          data: normalized.shares.map((share) => ({
            dashboardId,
            subjectType: this.toShareSubjectType(share.subjectType),
            subjectId: share.subjectId
          }))
        });
      }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'DASHBOARD_UPDATE',
      targetType: 'dashboard-definition',
      targetId: dashboardId,
      payload,
      metadata: {
        appId,
        folderId: normalized.folderId,
        sourceReportId: normalized.sourceReportId,
        ownerContactId: existing.ownerContactId,
        filterCount: normalized.filters.length,
        widgetCount: normalized.widgets.length,
        shareMode: normalized.shareMode,
        shareCount: normalized.shares.length
      }
    });

    return this.getDashboard(user, appId, dashboardId);
  }

  async deleteDashboard(user: SessionUser, appId: string, dashboardId: string): Promise<void> {
    await this.assertAppExists(appId);
    const existing = await this.getDashboardOrThrow(appId, dashboardId);
    this.assertCanManageDashboard(user, existing);

    await this.prismaService.dashboardDefinitionRecord.delete({
      where: { id: dashboardId }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'DASHBOARD_DELETE',
      targetType: 'dashboard-definition',
      targetId: dashboardId,
      metadata: {
        appId,
        folderId: existing.folderId,
        sourceReportId: existing.sourceReportId
      }
    });
  }

  async updateDashboardShares(
    user: SessionUser,
    appId: string,
    dashboardId: string,
    sharesPayload: unknown[]
  ): Promise<DashboardResponse> {
    await this.assertAppExists(appId);
    const dashboard = await this.getDashboardOrThrow(appId, dashboardId);
    this.assertCanManageDashboard(user, dashboard);

    if (dashboard.shareMode !== ReportShareMode.RESTRICTED) {
      throw new BadRequestException('Dashboard shares can be updated only when shareMode is restricted');
    }

    const shares = this.normalizeShareGrants(sharesPayload, 'shares');
    if (shares.length === 0) {
      throw new BadRequestException('Restricted dashboard requires at least one share grant');
    }

    this.assertDashboardSharesCompatibleWithSourceReport(
      dashboard.folder,
      {
        shareMode: 'restricted',
        shares
      },
      dashboard.sourceReport
    );

    await this.prismaService.$transaction(async (tx) => {
      await tx.dashboardDefinitionShareRecord.deleteMany({
        where: { dashboardId }
      });

      await tx.dashboardDefinitionShareRecord.createMany({
        data: shares.map((share) => ({
          dashboardId,
          subjectType: this.toShareSubjectType(share.subjectType),
          subjectId: share.subjectId
        }))
      });
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'DASHBOARD_SHARES_UPDATE',
      targetType: 'dashboard-definition',
      targetId: dashboardId,
      payload: shares,
      metadata: {
        appId,
        shareCount: shares.length
      }
    });

    return this.getDashboard(user, appId, dashboardId);
  }

  async runDashboard(
    user: SessionUser,
    appId: string,
    dashboardId: string,
    payload: { filters?: unknown[] } | undefined
  ): Promise<DashboardRunResponse> {
    await this.assertAppExists(appId);
    const dashboardRecord = await this.getDashboardOrThrow(appId, dashboardId);
    this.assertCanViewDashboard(user, dashboardRecord.folder, dashboardRecord);
    const dashboard = this.mapDashboardDefinition(user, dashboardRecord);
    const sourceReportContext = this.readDashboardSourceReportContext(dashboardRecord.sourceReport);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      'rest:dashboards-read',
      sourceReportContext.objectApiName,
      {
        queryKind: 'DASHBOARD_RUN'
      }
    );

    const appliedFilters = this.normalizeRuntimeFilters(payload?.filters ?? [], dashboard.filters);
    const filterStates = await Promise.all(
      dashboard.filters.map((filter) => this.loadRuntimeFilterState(user, appId, dashboard, sourceReportContext, visibility, filter, appliedFilters))
    );

    const optionKeyMapByField = new Map(
      filterStates.map((filterState) => [
        filterState.field,
        new Set(filterState.options.map((option) => this.buildScalarKey(option.value)))
      ])
    );

    for (const appliedFilter of appliedFilters) {
      const optionKeys = optionKeyMapByField.get(appliedFilter.field);
      if (!optionKeys?.has(this.buildScalarKey(appliedFilter.value))) {
        throw new BadRequestException(`Invalid dashboard filter value for field ${appliedFilter.field}`);
      }
    }

    const widgetResults: DashboardRunWidget[] = [];
    for (const widget of dashboard.widgets) {
      widgetResults.push(
        await this.runWidget(user, appId, dashboard, sourceReportContext, visibility, appliedFilters, widget)
      );
    }

    return {
      dashboard,
      availableFilters: filterStates,
      appliedFilters,
      widgets: widgetResults
    };
  }

  async searchContacts(_user: SessionUser, appId: string, query: string, limit: number | undefined) {
    await this.assertAppExists(appId);
    return {
      items: await this.salesforceService.searchContactsByIdOrName(query, limit ?? 8)
    };
  }

  async searchPermissions(_user: SessionUser, appId: string, query: string, limit: number | undefined) {
    await this.assertAppExists(appId);
    const snapshot = await this.aclConfigRepository.loadSnapshot();
    const normalizedQuery = query.trim().toLowerCase();
    const maxItems = this.clamp(limit ?? 12, 1, 25);

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
    await this.assertAppExists(appId);
    const normalizedQuery = query.trim().toLowerCase();
    const maxItems = this.clamp(limit ?? 20, 1, 25);
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
        .filter((report) => this.canAccessSourceReport(user, report))
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
    await this.assertAppExists(appId);
    const sourceReport = await this.getSourceReportOrThrow(appId, reportId);
    this.assertCanUseSourceReport(user, sourceReport);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      'rest:dashboards-write',
      sourceReport.objectApiName,
      {
        queryKind: 'DASHBOARD_CONFIG'
      }
    );
    const visibleFieldMap = await this.buildVisibleFieldMetadataMap(sourceReport.objectApiName, visibility);
    const normalizedQuery = query?.trim().toLowerCase() ?? '';
    const maxItems = this.clamp(limit ?? 25, 1, 50);

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

  private async listFoldersWithDashboards(appId: string): Promise<DashboardFolderRecordWithRelations[]> {
    return this.prismaService.dashboardFolderRecord.findMany({
      where: { appId },
      include: {
        shares: true,
        dashboards: {
          include: {
            shares: true,
            sourceReport: {
              include: {
                shares: true,
                folder: {
                  include: {
                    shares: true
                  }
                }
              }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      },
      orderBy: [{ label: 'asc' }, { updatedAt: 'desc' }]
    });
  }

  private async getFolderOrThrow(appId: string, folderId: string): Promise<DashboardFolderRecordWithRelations> {
    const folder = await this.prismaService.dashboardFolderRecord.findFirst({
      where: {
        id: folderId,
        appId
      },
      include: {
        shares: true,
        dashboards: {
          include: {
            shares: true,
            sourceReport: {
              include: {
                shares: true,
                folder: {
                  include: {
                    shares: true
                  }
                }
              }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      }
    });

    if (!folder) {
      throw new NotFoundException(`Dashboard folder ${folderId} not found`);
    }

    return folder;
  }

  private async getDashboardOrThrow(appId: string, dashboardId: string): Promise<DashboardRecordWithRelations> {
    const dashboard = await this.prismaService.dashboardDefinitionRecord.findFirst({
      where: {
        id: dashboardId,
        appId
      },
      include: {
        shares: true,
        folder: {
          include: {
            shares: true,
            dashboards: {
              include: {
                shares: true
              },
              orderBy: {
                updatedAt: 'desc'
              }
            }
          }
        },
        sourceReport: {
          include: {
            shares: true,
            folder: {
              include: {
                shares: true
              }
            }
          }
        }
      }
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard ${dashboardId} not found`);
    }

    return dashboard;
  }

  private async getSourceReportOrThrow(appId: string, reportId: string): Promise<SourceReportRecord> {
    const report = await this.prismaService.reportDefinitionRecord.findFirst({
      where: {
        id: reportId,
        appId
      },
      include: {
        shares: true,
        folder: {
          include: {
            shares: true
          }
        }
      }
    });

    if (!report) {
      throw new NotFoundException(`Source report ${reportId} not found`);
    }

    return report;
  }

  private async assertAppExists(appId: string): Promise<void> {
    this.resourceAccessService.assertKebabCaseId(appId, 'appId');
    if (!(await this.appsAdminConfigRepository.hasApp(appId))) {
      throw new NotFoundException(`App config ${appId} not found`);
    }
  }

  private mapFolderSummary(user: SessionUser, folder: DashboardFolderRecordWithRelations): DashboardFolderSummary {
    return {
      id: folder.id,
      appId: folder.appId,
      label: folder.label,
      description: folder.description ?? undefined,
      ownerContactId: folder.ownerContactId,
      accessMode: this.fromFolderAccessMode(folder.accessMode),
      shares: folder.shares.map((share) => this.mapShareGrant(share)),
      dashboardCount: folder.dashboards.filter((dashboard) => this.canAccessDashboard(user, folder, dashboard)).length,
      canEdit: this.canManageDashboardFolder(user, folder, false),
      canShare: this.canManageDashboardFolder(user, folder, false),
      updatedAt: folder.updatedAt.toISOString()
    };
  }

  private mapDashboardSummary(
    user: SessionUser,
    dashboard: DashboardFolderRecordWithRelations['dashboards'][number] | DashboardRecordWithRelations
  ): DashboardSummary {
    const widgets = this.readDashboardWidgets(
      dashboard.widgetsJson,
      dashboard.layoutJson,
      `dashboard ${dashboard.id}.widgets`
    );
    const filters = this.readDashboardFilters(dashboard.filtersJson, `dashboard ${dashboard.id}.filters`);

    return {
      id: dashboard.id,
      appId: dashboard.appId,
      folderId: dashboard.folderId,
      sourceReportId: dashboard.sourceReportId,
      sourceReportLabel: dashboard.sourceReport.label,
      sourceObjectApiName: dashboard.sourceReport.objectApiName,
      label: dashboard.label,
      description: dashboard.description ?? undefined,
      ownerContactId: dashboard.ownerContactId,
      shareMode: this.fromShareMode(dashboard.shareMode),
      filterCount: filters.length,
      widgetCount: widgets.length,
      canEdit: this.canManageDashboard(user, dashboard, false),
      canShare: this.canManageDashboard(user, dashboard, false),
      updatedAt: dashboard.updatedAt.toISOString()
    };
  }

  private mapDashboardDefinition(user: SessionUser, dashboard: DashboardRecordWithRelations): DashboardDefinition {
    return {
      ...this.mapDashboardSummary(user, dashboard),
      filters: this.readDashboardFilters(dashboard.filtersJson, `dashboard ${dashboard.id}.filters`),
      widgets: this.readDashboardWidgets(dashboard.widgetsJson, dashboard.layoutJson, `dashboard ${dashboard.id}.widgets`),
      shares: dashboard.shares.map((share) => this.mapShareGrant(share))
    };
  }

  private mapShareGrant(
    share:
      | DashboardFolderRecordWithRelations['shares'][number]
      | DashboardRecordWithRelations['shares'][number]
      | SourceReportRecord['shares'][number]
      | SourceReportRecord['folder']['shares'][number]
  ): ReportShareGrant {
    return {
      subjectType: share.subjectType === ReportShareSubjectType.CONTACT ? 'contact' : 'permission',
      subjectId: share.subjectId
    };
  }

  private normalizeFolderInput(value: unknown): UpsertDashboardFolderInput {
    const payload = this.requireObject(value, 'folder payload must be an object');
    const label = this.requireString(payload.label, 'folder.label is required');
    const accessMode = this.normalizeFolderAccessMode(payload.accessMode);
    const shares = this.normalizeShareGrants(Array.isArray(payload.shares) ? payload.shares : [], 'folder.shares');

    if (accessMode === 'personal' && shares.length > 0) {
      throw new BadRequestException('Personal folder does not accept share grants');
    }

    if (accessMode === 'shared' && shares.length === 0) {
      throw new BadRequestException('Shared folder requires at least one share grant');
    }

    return {
      label,
      description: this.asOptionalString(payload.description),
      accessMode,
      shares
    };
  }

  private normalizeDashboardInput(
    value: unknown,
    existing?: Pick<DashboardRecordWithRelations, 'sourceReportId'>
  ): UpsertDashboardDefinitionInput {
    const payload = this.requireObject(value, 'dashboard payload must be an object');
    const folderId = this.requireUuidString(payload.folderId, 'dashboard.folderId');
    const label = this.requireString(payload.label, 'dashboard.label is required');
    const sourceReportId = this.normalizeSourceReportId(payload.sourceReportId, existing?.sourceReportId);
    const filters = this.normalizeDashboardFilters(payload.filters);
    const widgets = this.normalizeDashboardWidgets(payload.widgets);
    const shareMode = this.normalizeShareMode(payload.shareMode);
    const shares = this.normalizeShareGrants(Array.isArray(payload.shares) ? payload.shares : [], 'dashboard.shares');

    if ((shareMode === 'inherit' || shareMode === 'personal') && shares.length > 0) {
      throw new BadRequestException(`Dashboard shareMode ${shareMode} does not accept explicit share grants`);
    }

    if (shareMode === 'restricted' && shares.length === 0) {
      throw new BadRequestException('Restricted dashboard requires at least one share grant');
    }

    return {
      folderId,
      sourceReportId,
      label,
      description: this.asOptionalString(payload.description),
      filters,
      widgets,
      shareMode,
      shares
    };
  }

  private normalizeSourceReportId(value: unknown, existingSourceReportId: string | undefined): string {
    if (existingSourceReportId) {
      const nextValue = this.asOptionalString(value);
      if (!nextValue) {
        return existingSourceReportId;
      }

      if (nextValue !== existingSourceReportId) {
        throw new BadRequestException('dashboard.sourceReportId cannot change after creation');
      }

      return existingSourceReportId;
    }

    return this.requireUuidString(value, 'dashboard.sourceReportId');
  }

  private normalizeDashboardFilters(value: unknown): DashboardFilterDefinition[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('dashboard.filters must be an array');
    }

    if (value.length > MAX_DASHBOARD_FILTERS) {
      throw new BadRequestException(`dashboard.filters supports at most ${MAX_DASHBOARD_FILTERS} filters`);
    }

    const filters = value.map((entry, index) => {
      const filter = this.requireObject(entry, `dashboard.filters[${index}] must be an object`);
      return {
        field: this.requireString(filter.field, `dashboard.filters[${index}].field is required`),
        label: this.asOptionalString(filter.label)
      } satisfies DashboardFilterDefinition;
    });

    this.assertUniqueFieldSequence(filters.map((filter) => filter.field), 'dashboard.filters');
    return filters;
  }

  private normalizeDashboardWidgets(value: unknown): DashboardWidgetDefinition[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('dashboard.widgets must be an array');
    }

    if (value.length === 0) {
      throw new BadRequestException('dashboard.widgets must contain at least one widget');
    }

    if (value.length > MAX_DASHBOARD_WIDGETS) {
      throw new BadRequestException(`dashboard.widgets supports at most ${MAX_DASHBOARD_WIDGETS} widgets`);
    }

    const widgets = value.map((entry, index) => this.normalizeDashboardWidget(entry, index));
    const uniqueIds = new Set(widgets.map((widget) => widget.id));
    if (uniqueIds.size !== widgets.length) {
      throw new BadRequestException('dashboard.widgets must not contain duplicate ids');
    }

    return widgets;
  }

  private normalizeDashboardWidget(value: unknown, index: number): DashboardWidgetDefinition {
    const widget = this.requireObject(value, `dashboard.widgets[${index}] must be an object`);
    const type = this.requireString(widget.type, `dashboard.widgets[${index}].type is required`);
    const id = this.requireString(widget.id, `dashboard.widgets[${index}].id is required`);
    const title = this.requireString(widget.title, `dashboard.widgets[${index}].title is required`);
    const layout = this.normalizeWidgetLayout(widget.layout, `dashboard.widgets[${index}].layout`, id);

    switch (type) {
      case 'kpi':
        return {
          id,
          type,
          title,
          layout,
          metric: this.normalizeMetricDefinition(widget.metric, `dashboard.widgets[${index}].metric`)
        };
      case 'chart':
        return {
          id,
          type,
          title,
          layout,
          chartType: this.normalizeChartType(widget.chartType, `dashboard.widgets[${index}].chartType`),
          dimensionField: this.requireString(widget.dimensionField, `dashboard.widgets[${index}].dimensionField is required`),
          dimensionLabel: this.asOptionalString(widget.dimensionLabel),
          metric: this.normalizeMetricDefinition(widget.metric, `dashboard.widgets[${index}].metric`),
          limit: this.normalizeOptionalWidgetLimit(widget.limit, `dashboard.widgets[${index}].limit`),
          sortDirection: this.normalizeOptionalSortDirection(widget.sortDirection, `dashboard.widgets[${index}].sortDirection`)
        };
      case 'table': {
        const displayMode = this.normalizeTableDisplayMode(widget.displayMode, `dashboard.widgets[${index}].displayMode`);

        if (displayMode === 'rows') {
          return {
            id,
            type,
            title,
            layout,
            displayMode,
            columns: this.normalizeTableColumns(widget.columns, `dashboard.widgets[${index}].columns`),
            limit: this.normalizeOptionalWidgetLimit(widget.limit, `dashboard.widgets[${index}].limit`)
          };
        }

        return {
          id,
          type,
          title,
          layout,
          displayMode,
          dimensionField: this.requireString(widget.dimensionField, `dashboard.widgets[${index}].dimensionField is required`),
          dimensionLabel: this.asOptionalString(widget.dimensionLabel),
          metric: this.normalizeMetricDefinition(widget.metric, `dashboard.widgets[${index}].metric`),
          limit: this.normalizeOptionalWidgetLimit(widget.limit, `dashboard.widgets[${index}].limit`),
          sortDirection: this.normalizeOptionalSortDirection(widget.sortDirection, `dashboard.widgets[${index}].sortDirection`)
        };
      }
      default:
        throw new BadRequestException(`dashboard.widgets[${index}].type is invalid`);
    }
  }

  private normalizeTableColumns(value: unknown, path: string): ReportColumn[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${path} must be an array`);
    }

    const columns = value.map((entry, index) => {
      const column = this.requireObject(entry, `${path}[${index}] must be an object`);
      return {
        field: this.requireString(column.field, `${path}[${index}].field is required`),
        label: this.asOptionalString(column.label)
      } satisfies ReportColumn;
    });

    if (columns.length === 0) {
      throw new BadRequestException(`${path} must contain at least one column`);
    }

    this.assertUniqueFieldSequence(columns.map((column) => column.field), path);
    return columns;
  }

  private normalizeMetricDefinition(value: unknown, path: string): DashboardMetricDefinition {
    const metric = this.requireObject(value, `${path} must be an object`);
    const operation = this.requireString(metric.operation, `${path}.operation is required`).toUpperCase();

    switch (operation) {
      case 'COUNT':
        return {
          operation,
          label: this.asOptionalString(metric.label)
        };
      case 'SUM':
      case 'AVG':
      case 'MIN':
      case 'MAX':
        return {
          operation,
          field: this.requireString(metric.field, `${path}.field is required`),
          label: this.asOptionalString(metric.label)
        };
      default:
        throw new BadRequestException(`${path}.operation is invalid`);
    }
  }

  private normalizeWidgetLayout(value: unknown, path: string, widgetId: string) {
    const layout = this.requireObject(value, `${path} must be an object`);
    const x = this.requireInteger(layout.x, `${path}.x is required`);
    const y = this.requireInteger(layout.y, `${path}.y is required`);
    const w = this.requireInteger(layout.w, `${path}.w is required`);
    const h = this.requireInteger(layout.h, `${path}.h is required`);

    if (x < 0 || x >= GRID_COLUMNS) {
      throw new BadRequestException(`${path}.x must be between 0 and ${GRID_COLUMNS - 1}`);
    }
    if (y < 0) {
      throw new BadRequestException(`${path}.y must be >= 0`);
    }
    if (w < 1 || w > GRID_COLUMNS) {
      throw new BadRequestException(`${path}.w must be between 1 and ${GRID_COLUMNS}`);
    }
    if (x + w > GRID_COLUMNS) {
      throw new BadRequestException(`${path}.x + w must fit within ${GRID_COLUMNS} columns`);
    }
    if (h < 1 || h > GRID_COLUMNS) {
      throw new BadRequestException(`${path}.h must be between 1 and ${GRID_COLUMNS}`);
    }

    return {
      widgetId,
      x,
      y,
      w,
      h
    };
  }

  private normalizeChartType(value: unknown, path: string): DashboardChartWidgetDefinition['chartType'] {
    const chartType = this.requireString(value, `${path} is required`);
    switch (chartType) {
      case 'bar':
      case 'line':
      case 'pie':
      case 'donut':
        return chartType;
      default:
        throw new BadRequestException(`${path} is invalid`);
    }
  }

  private normalizeTableDisplayMode(value: unknown, path: string): 'grouped' | 'rows' {
    const mode = this.requireString(value, `${path} is required`);
    if (mode !== 'grouped' && mode !== 'rows') {
      throw new BadRequestException(`${path} is invalid`);
    }

    return mode;
  }

  private normalizeOptionalWidgetLimit(value: unknown, path: string): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const limit = this.requireInteger(value, `${path} is invalid`);
    if (limit < 1 || limit > MAX_WIDGET_LIMIT) {
      throw new BadRequestException(`${path} must be between 1 and ${MAX_WIDGET_LIMIT}`);
    }

    return limit;
  }

  private normalizeOptionalSortDirection(value: unknown, path: string): 'ASC' | 'DESC' | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const direction = this.requireString(value, `${path} is invalid`).toUpperCase();
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new BadRequestException(`${path} is invalid`);
    }

    return direction;
  }

  private normalizeShareGrants(value: unknown[], fieldName: string): ReportShareGrant[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} must be an array`);
    }

    const shares = value.map((entry, index) => {
      const share = this.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const subjectType = this.requireString(share.subjectType, `${fieldName}[${index}].subjectType is required`);
      const normalizedType = this.normalizeShareSubjectType(subjectType, `${fieldName}[${index}].subjectType`);
      const subjectId = this.requireString(share.subjectId, `${fieldName}[${index}].subjectId is required`);

      if (normalizedType === 'contact' && !SALESFORCE_ID_PATTERN.test(subjectId)) {
        throw new BadRequestException(`${fieldName}[${index}].subjectId must be a valid Salesforce Contact id`);
      }

      return {
        subjectType: normalizedType,
        subjectId
      } satisfies ReportShareGrant;
    });

    const uniqueKeys = new Set(shares.map((share) => this.buildShareGrantKey(share)));
    if (uniqueKeys.size !== shares.length) {
      throw new BadRequestException(`${fieldName} must not contain duplicates`);
    }

    return shares;
  }

  private normalizeRuntimeFilters(value: unknown[], allowedFilters: DashboardFilterDefinition[]): DashboardAppliedFilter[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('filters must be an array');
    }

    const allowedFields = new Set(allowedFilters.map((filter) => filter.field));
    const applied = value.map((entry, index) => {
      const filter = this.requireObject(entry, `filters[${index}] must be an object`);
      const field = this.requireString(filter.field, `filters[${index}].field is required`);
      if (!allowedFields.has(field)) {
        throw new BadRequestException(`filters[${index}].field is not configured on this dashboard`);
      }

      return {
        field,
        value: this.normalizeScalarValue(filter.value, `filters[${index}].value`)
      };
    });

    this.assertUniqueFieldSequence(applied.map((filter) => filter.field), 'filters');
    return applied;
  }

  private readDashboardSourceReportContext(report: SourceReportRecord): DashboardRuntimeReportContext {
    return {
      objectApiName: report.objectApiName,
      filters: this.readReportFilters(report.filtersJson, `sourceReport ${report.id}.filters`)
    };
  }

  private readDashboardFilters(value: Prisma.JsonValue, fieldName: string): DashboardFilterDefinition[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const filter = this.requireObject(entry, `${fieldName}[${index}] must be an object`);
      return {
        field: this.requireString(filter.field, `${fieldName}[${index}].field is required`),
        label: this.asOptionalString(filter.label)
      };
    });
  }

  private readDashboardWidgets(
    widgetsValue: Prisma.JsonValue,
    layoutValue: Prisma.JsonValue,
    fieldName: string
  ): DashboardWidgetDefinition[] {
    if (!Array.isArray(widgetsValue) || !Array.isArray(layoutValue)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    const layoutMap = new Map(
      layoutValue.map((entry, index) => {
        const layout = this.requireObject(entry, `${fieldName}.layout[${index}] must be an object`);
        const widgetId = this.requireString(layout.widgetId, `${fieldName}.layout[${index}].widgetId is required`);
        return [
          widgetId,
          {
            widgetId,
            x: this.requireInteger(layout.x, `${fieldName}.layout[${index}].x is required`),
            y: this.requireInteger(layout.y, `${fieldName}.layout[${index}].y is required`),
            w: this.requireInteger(layout.w, `${fieldName}.layout[${index}].w is required`),
            h: this.requireInteger(layout.h, `${fieldName}.layout[${index}].h is required`)
          }
        ];
      })
    );

    return widgetsValue.map((entry, index) => {
      const widget = this.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const id = this.requireString(widget.id, `${fieldName}[${index}].id is required`);
      const title = this.requireString(widget.title, `${fieldName}[${index}].title is required`);
      const layout = layoutMap.get(id);
      if (!layout) {
        throw new BadRequestException(`${fieldName}[${index}] is invalid: missing layout entry`);
      }
      const type = this.requireString(widget.type, `${fieldName}[${index}].type is required`);

      switch (type) {
        case 'kpi':
          return {
            id,
            type,
            title,
            layout,
            metric: this.readMetricDefinition(widget.metric, `${fieldName}[${index}].metric`)
          };
        case 'chart':
          return {
            id,
            type,
            title,
            layout,
            chartType: this.normalizeChartType(widget.chartType, `${fieldName}[${index}].chartType`),
            dimensionField: this.requireString(widget.dimensionField, `${fieldName}[${index}].dimensionField is required`),
            dimensionLabel: this.asOptionalString(widget.dimensionLabel),
            metric: this.readMetricDefinition(widget.metric, `${fieldName}[${index}].metric`),
            limit: this.asOptionalNumber(widget.limit) ?? undefined,
            sortDirection: this.asOptionalString(widget.sortDirection)?.toUpperCase() as 'ASC' | 'DESC' | undefined
          };
        case 'table': {
          const displayMode = this.normalizeTableDisplayMode(widget.displayMode, `${fieldName}[${index}].displayMode`);
          if (displayMode === 'rows') {
            return {
              id,
              type,
              title,
              layout,
              displayMode,
              columns: this.readReportColumns(widget.columns, `${fieldName}[${index}].columns`),
              limit: this.asOptionalNumber(widget.limit) ?? undefined
            };
          }

          return {
            id,
            type,
            title,
            layout,
            displayMode,
            dimensionField: this.requireString(widget.dimensionField, `${fieldName}[${index}].dimensionField is required`),
            dimensionLabel: this.asOptionalString(widget.dimensionLabel),
            metric: this.readMetricDefinition(widget.metric, `${fieldName}[${index}].metric`),
            limit: this.asOptionalNumber(widget.limit) ?? undefined,
            sortDirection: this.asOptionalString(widget.sortDirection)?.toUpperCase() as 'ASC' | 'DESC' | undefined
          };
        }
        default:
          throw new BadRequestException(`${fieldName}[${index}].type is invalid`);
      }
    });
  }

  private readMetricDefinition(value: unknown, path: string): DashboardMetricDefinition {
    const metric = this.requireObject(value, `${path} must be an object`);
    const operation = this.requireString(metric.operation, `${path}.operation is required`).toUpperCase();

    if (operation === 'COUNT') {
      return {
        operation,
        label: this.asOptionalString(metric.label)
      };
    }

    if (operation === 'SUM' || operation === 'AVG' || operation === 'MIN' || operation === 'MAX') {
      return {
        operation,
        field: this.requireString(metric.field, `${path}.field is required`),
        label: this.asOptionalString(metric.label)
      };
    }

    throw new BadRequestException(`${path}.operation is invalid`);
  }

  private readReportColumns(value: unknown, fieldName: string): ReportColumn[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const column = this.requireObject(entry, `${fieldName}[${index}] must be an object`);
      return {
        field: this.requireString(column.field, `${fieldName}[${index}].field is required`),
        label: this.asOptionalString(column.label)
      };
    });
  }

  private readReportFilters(value: Prisma.JsonValue, fieldName: string): ReportFilter[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const filter = this.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const operator = this.requireString(filter.operator, `${fieldName}[${index}].operator is required`) as ReportFilter['operator'];
      return {
        field: this.requireString(filter.field, `${fieldName}[${index}].field is required`),
        operator: this.normalizeReportFilterOperator(operator, `${fieldName}[${index}].operator`),
        value: this.normalizeReportFilterValue(filter.value, operator, `${fieldName}[${index}].value`)
      };
    });
  }

  private toWidgetsJson(widgets: DashboardWidgetDefinition[]): Prisma.InputJsonValue {
    return widgets.map((widget) => {
      const { layout, ...storedWidget } = widget;
      return storedWidget;
    }) as unknown as Prisma.InputJsonValue;
  }

  private toLayoutJson(widgets: DashboardWidgetDefinition[]): Prisma.InputJsonValue {
    return widgets.map((widget) => widget.layout) as unknown as Prisma.InputJsonValue;
  }

  private async validateDashboardDefinition(
    user: SessionUser,
    sourceReport: SourceReportRecord,
    dashboard: UpsertDashboardDefinitionInput,
    folderId: string
  ): Promise<void> {
    const folder = await this.getFolderOrThrow(sourceReport.appId, folderId);
    this.assertDashboardSharesCompatibleWithSourceReport(folder, dashboard, sourceReport);

    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      'rest:dashboards-write',
      sourceReport.objectApiName,
      {
        queryKind: 'DASHBOARD_CONFIG'
      }
    );
    const visibleFieldMap = await this.buildVisibleFieldMetadataMap(sourceReport.objectApiName, visibility);

    for (const filter of dashboard.filters) {
      const field = visibleFieldMap.get(filter.field);
      if (!field) {
        throw new BadRequestException(`dashboard.filters field ${filter.field} is not visible on the source report object`);
      }
      if (!field.filterable) {
        throw new BadRequestException(`dashboard.filters field ${filter.field} is not filterable`);
      }
    }

    for (const widget of dashboard.widgets) {
      this.validateWidgetFields(widget, visibleFieldMap);
    }
  }

  private async buildVisibleFieldMetadataMap(
    objectApiName: string,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>
  ): Promise<Map<string, DashboardFieldMetadata>> {
    const fields = await this.salesforceService.describeObjectFields(objectApiName.trim());
    const visibleFieldNames = new Set(
      this.reportSoqlBuilderService.filterVisibleFieldNames(
        fields.map((field) => field.name),
        visibility
      )
    );

    return new Map(
      fields
        .filter((field) => visibleFieldNames.has(field.name))
        .map((field) => [
          field.name,
          {
            name: field.name,
            label: field.label,
            type: field.type,
            filterable: field.filterable
          } satisfies DashboardFieldMetadata
        ])
    );
  }

  private validateWidgetFields(widget: DashboardWidgetDefinition, fieldMap: Map<string, DashboardFieldMetadata>): void {
    switch (widget.type) {
      case 'kpi':
        this.validateMetricField(widget.metric, fieldMap, `${widget.type}:${widget.id}`);
        return;
      case 'chart':
        this.assertFieldVisible(widget.dimensionField, fieldMap, `chart:${widget.id}.dimensionField`);
        this.validateMetricField(widget.metric, fieldMap, `chart:${widget.id}.metric`);
        return;
      case 'table':
        if (widget.displayMode === 'grouped') {
          this.assertFieldVisible(widget.dimensionField, fieldMap, `table:${widget.id}.dimensionField`);
          this.validateMetricField(widget.metric, fieldMap, `table:${widget.id}.metric`);
          return;
        }

        for (const column of widget.columns) {
          this.assertFieldVisible(column.field, fieldMap, `table:${widget.id}.columns`);
        }
    }
  }

  private validateMetricField(metric: DashboardMetricDefinition, fieldMap: Map<string, DashboardFieldMetadata>, path: string): void {
    if (metric.operation === 'COUNT') {
      return;
    }

    const field = fieldMap.get(metric.field ?? '');
    if (!field) {
      throw new BadRequestException(`${path}.field is not visible on the source report object`);
    }

    if (!NUMERIC_FIELD_TYPES.has(field.type.toLowerCase())) {
      throw new BadRequestException(`${path}.field must be numeric for ${metric.operation}`);
    }
  }

  private assertFieldVisible(fieldName: string, fieldMap: Map<string, DashboardFieldMetadata>, path: string): void {
    if (!fieldMap.has(fieldName)) {
      throw new BadRequestException(`${path} is not visible on the source report object`);
    }
  }

  private assertFolderScopeCompatibleWithDashboards(
    folder: UpsertDashboardFolderInput,
    dashboards: DashboardFolderRecordWithRelations['dashboards']
  ): void {
    for (const dashboard of dashboards) {
      this.assertDashboardSharesCompatibleWithSourceReport(
        {
          accessMode: this.toFolderAccessMode(folder.accessMode),
          shares: folder.shares.map((share) => ({
            id: '',
            folderId: dashboard.folderId,
            subjectType: this.toShareSubjectType(share.subjectType),
            subjectId: share.subjectId,
            createdAt: new Date(),
            updatedAt: new Date()
          }))
        } as DashboardRecordWithRelations['folder'],
        {
          shareMode: this.fromShareMode(dashboard.shareMode),
          shares: dashboard.shares.map((share) => this.mapShareGrant(share))
        },
        dashboard.sourceReport
      );
    }
  }

  private assertDashboardSharesCompatibleWithSourceReport(
    folder: Pick<DashboardRecordWithRelations['folder'], 'accessMode' | 'shares'>,
    dashboard: Pick<UpsertDashboardDefinitionInput, 'shareMode' | 'shares'>,
    sourceReport: SourceReportRecord
  ): void {
    const grantEnvelope = this.buildSourceReportGrantEnvelope(sourceReport);
    this.assertGrantSubset('Dashboard folder', this.fromFolderAccessMode(folder.accessMode), folder.shares.map((share) => this.mapShareGrant(share)), grantEnvelope);
    this.assertGrantSubset('Dashboard', dashboard.shareMode, dashboard.shares, grantEnvelope);
  }

  private buildSourceReportGrantEnvelope(sourceReport: SourceReportRecord): DashboardGrantEnvelope {
    if (sourceReport.folder.accessMode === ReportFolderAccessMode.PERSONAL) {
      return { ownerOnly: true, allowedGrantKeys: new Set<string>() };
    }

    if (sourceReport.shareMode === ReportShareMode.PERSONAL) {
      return { ownerOnly: true, allowedGrantKeys: new Set<string>() };
    }

    const folderGrantKeys = new Set(
      sourceReport.folder.shares.map((share) => this.buildShareGrantKey(this.mapShareGrant(share)))
    );

    if (sourceReport.shareMode === ReportShareMode.INHERIT) {
      return {
        ownerOnly: false,
        allowedGrantKeys: folderGrantKeys
      };
    }

    const reportGrantKeys = new Set(
      sourceReport.shares.map((share) => this.buildShareGrantKey(this.mapShareGrant(share)))
    );

    return {
      ownerOnly: false,
      allowedGrantKeys: new Set(
        [...folderGrantKeys].filter((key) => reportGrantKeys.has(key))
      )
    };
  }

  private assertGrantSubset(
    scopeLabel: string,
    mode: 'personal' | 'shared' | 'inherit' | 'restricted',
    shares: ReportShareGrant[],
    grantEnvelope: DashboardGrantEnvelope
  ): void {
    if (mode === 'personal' || mode === 'inherit') {
      return;
    }

    if (grantEnvelope.ownerOnly) {
      throw new BadRequestException(`${scopeLabel} cannot be shared beyond the source report access scope`);
    }

    for (const share of shares) {
      if (!grantEnvelope.allowedGrantKeys.has(this.buildShareGrantKey(share))) {
        throw new BadRequestException(`${scopeLabel} cannot be more permissive than the source report`);
      }
    }
  }

  private async loadRuntimeFilterState(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    filter: DashboardFilterDefinition,
    appliedFilters: DashboardAppliedFilter[]
  ): Promise<DashboardFilterRuntimeState> {
    const siblingFilters = appliedFilters
      .filter((entry) => entry.field !== filter.field)
      .map((entry) => this.toEqualityReportFilter(entry));

    const compiled = this.reportSoqlBuilderService.buildDistinctValueQuery(
      {
        objectApiName: sourceReportContext.objectApiName,
        filters: sourceReportContext.filters
      },
      visibility,
      {
        field: filter.field,
        runtimeFilters: siblingFilters,
        limit: FILTER_OPTIONS_LIMIT
      }
    );

    const rawResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'DASHBOARD_RUN',
      targetId: `${dashboard.id}:${filter.field}:options`,
      objectApiName: sourceReportContext.objectApiName,
      resolvedSoql: compiled.soql,
      visibility,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      metadata: {
        appId,
        dashboardId: dashboard.id,
        filterField: filter.field,
        phase: 'filter-options'
      }
    });
    const records = this.extractRecords(rawResult);
    const selectedValue = appliedFilters.find((entry) => entry.field === filter.field)?.value;

    return {
      field: filter.field,
      label: filter.label?.trim() || filter.field,
      selectedValue,
      options: records.map((record) => {
        const optionValue = this.toScalarValue(record[filter.field]);
        return {
          value: optionValue,
          label: this.stringifyScalarValue(optionValue),
          count: this.toSafeNumber(record.optionCount)
        } satisfies DashboardFilterOption;
      })
    };
  }

  private async runWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    appliedFilters: DashboardAppliedFilter[],
    widget: DashboardWidgetDefinition
  ): Promise<DashboardRunWidget> {
    const runtimeFilters = appliedFilters.map((entry) => this.toEqualityReportFilter(entry));

    switch (widget.type) {
      case 'kpi':
        return this.runKpiWidget(user, appId, dashboard, sourceReportContext, visibility, runtimeFilters, widget);
      case 'chart':
        return this.runChartWidget(user, appId, dashboard, sourceReportContext, visibility, runtimeFilters, widget);
      case 'table':
        if (widget.displayMode === 'grouped') {
          return this.runGroupedTableWidget(user, appId, dashboard, sourceReportContext, visibility, runtimeFilters, widget);
        }
        return this.runRowsTableWidget(user, appId, dashboard, sourceReportContext, visibility, runtimeFilters, widget);
    }
  }

  private async runKpiWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    runtimeFilters: ReportFilter[],
    widget: DashboardKpiWidgetDefinition
  ): Promise<DashboardRunKpiWidget> {
    const compiled = this.reportSoqlBuilderService.buildAggregateQuery(
      sourceReportContext,
      visibility,
      {
        metricOperation: widget.metric.operation,
        metricField: widget.metric.field,
        runtimeFilters
      }
    );
    const rawResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'DASHBOARD_RUN',
      targetId: `${dashboard.id}:${widget.id}`,
      objectApiName: sourceReportContext.objectApiName,
      resolvedSoql: compiled.soql,
      visibility,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      metadata: {
        appId,
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetType: widget.type
      }
    });
    const records = this.extractRecords(rawResult);
    const metricRecord = records[0];

    return {
      id: widget.id,
      type: 'kpi',
      title: widget.title,
      metric: widget.metric,
      value: metricRecord ? this.toSafeNumber(metricRecord.metricValue) : 0
    };
  }

  private async runChartWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    runtimeFilters: ReportFilter[],
    widget: DashboardChartWidgetDefinition
  ): Promise<DashboardRunChartWidget> {
    const compiled = this.reportSoqlBuilderService.buildAggregateQuery(
      sourceReportContext,
      visibility,
      {
        dimensionField: widget.dimensionField,
        metricOperation: widget.metric.operation,
        metricField: widget.metric.field,
        runtimeFilters,
        limit: widget.limit ?? MAX_WIDGET_LIMIT,
        sortDirection: widget.sortDirection
      }
    );
    const rawResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'DASHBOARD_RUN',
      targetId: `${dashboard.id}:${widget.id}`,
      objectApiName: sourceReportContext.objectApiName,
      resolvedSoql: compiled.soql,
      visibility,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      metadata: {
        appId,
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetType: widget.type
      }
    });
    const records = this.extractRecords(rawResult);

    return {
      id: widget.id,
      type: 'chart',
      title: widget.title,
      chartType: widget.chartType,
      metric: widget.metric,
      dimensionField: widget.dimensionField,
      points: records.map((record) => {
        const rawValue = this.toScalarValue(record[widget.dimensionField]);
        return {
          key: this.buildScalarKey(rawValue),
          label: this.stringifyScalarValue(rawValue),
          rawValue,
          value: this.toSafeNumber(record.metricValue)
        };
      })
    };
  }

  private async runGroupedTableWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    runtimeFilters: ReportFilter[],
    widget: DashboardTableGroupedWidgetDefinition
  ): Promise<DashboardRunTableGroupedWidget> {
    const compiled = this.reportSoqlBuilderService.buildAggregateQuery(
      sourceReportContext,
      visibility,
      {
        dimensionField: widget.dimensionField,
        metricOperation: widget.metric.operation,
        metricField: widget.metric.field,
        runtimeFilters,
        limit: widget.limit ?? MAX_WIDGET_LIMIT,
        sortDirection: widget.sortDirection
      }
    );
    const rawResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'DASHBOARD_RUN',
      targetId: `${dashboard.id}:${widget.id}`,
      objectApiName: sourceReportContext.objectApiName,
      resolvedSoql: compiled.soql,
      visibility,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      metadata: {
        appId,
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetType: widget.type
      }
    });
    const records = this.extractRecords(rawResult);

    return {
      id: widget.id,
      type: 'table',
      displayMode: 'grouped',
      title: widget.title,
      metric: widget.metric,
      dimensionField: widget.dimensionField,
      rows: records.map((record) => {
        const rawValue = this.toScalarValue(record[widget.dimensionField]);
        return {
          key: this.buildScalarKey(rawValue),
          label: this.stringifyScalarValue(rawValue),
          rawValue,
          metricValue: this.toSafeNumber(record.metricValue)
        };
      })
    };
  }

  private async runRowsTableWidget(
    user: SessionUser,
    appId: string,
    dashboard: DashboardDefinition,
    sourceReportContext: DashboardRuntimeReportContext,
    visibility: Awaited<ReturnType<ResourceAccessService['authorizeObjectAccess']>>,
    runtimeFilters: ReportFilter[],
    widget: DashboardTableRowsWidgetDefinition
  ): Promise<DashboardRunTableRowsWidget> {
    const compiled = this.reportSoqlBuilderService.buildRowsQuery(
      {
        objectApiName: sourceReportContext.objectApiName,
        filters: sourceReportContext.filters,
        sort: this.buildRowsWidgetSort(widget.columns)
      },
      visibility,
      {
        columns: widget.columns,
        runtimeFilters,
        limit: widget.limit ?? MAX_WIDGET_LIMIT
      }
    );
    const rawResult = await this.queryAuditService.executeReadOnlyQueryWithAudit({
      contactId: user.sub,
      queryKind: 'DASHBOARD_RUN',
      targetId: `${dashboard.id}:${widget.id}`,
      objectApiName: sourceReportContext.objectApiName,
      resolvedSoql: compiled.soql,
      visibility,
      baseWhere: compiled.baseWhere,
      finalWhere: compiled.finalWhere,
      metadata: {
        appId,
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetType: widget.type
      }
    });
    const records = this.extractRecords(rawResult);

    return {
      id: widget.id,
      type: 'table',
      displayMode: 'rows',
      title: widget.title,
      columns: compiled.visibleColumns,
      rows: records.map((record) => this.mapTableRow(record, compiled.visibleColumns))
    };
  }

  private buildRowsWidgetSort(columns: ReportColumn[]): ReportSort[] {
    return columns.slice(0, 1).map((column) => ({
      field: column.field,
      direction: 'ASC'
    }));
  }

  private mapTableRow(record: Record<string, unknown>, columns: ReportColumn[]): DashboardRunTableRow {
    return {
      id: typeof record.Id === 'string' ? record.Id : this.buildSyntheticRowId(record),
      values: Object.fromEntries(columns.map((column) => [column.field, record[column.field]]))
    };
  }

  private extractRecords(result: unknown): Array<Record<string, unknown>> {
    if (!this.isObjectRecord(result) || !Array.isArray(result.records)) {
      return [];
    }

    return result.records.filter((record): record is Record<string, unknown> => this.isObjectRecord(record));
  }

  private canWriteDashboards(user: SessionUser): boolean {
    return this.aclService.canAccess(user.permissions, 'rest:dashboards-write');
  }

  private canAccessDashboardFolder(user: SessionUser, folder: DashboardFolderRecordWithRelations): boolean {
    if (this.isAdmin(user) || folder.ownerContactId === user.sub) {
      return true;
    }

    if (folder.accessMode === ReportFolderAccessMode.PERSONAL) {
      return false;
    }

    return this.hasMatchingShareGrant(user, folder.shares);
  }

  private canAccessSourceReport(user: SessionUser, report: SourceReportRecord): boolean {
    if (this.isAdmin(user) || report.ownerContactId === user.sub) {
      return true;
    }

    if (report.folder.accessMode === ReportFolderAccessMode.PERSONAL) {
      return false;
    }

    const canAccessFolder = this.hasMatchingShareGrant(user, report.folder.shares);
    if (!canAccessFolder) {
      return false;
    }

    switch (report.shareMode) {
      case ReportShareMode.INHERIT:
        return true;
      case ReportShareMode.PERSONAL:
        return false;
      case ReportShareMode.RESTRICTED:
        return this.hasMatchingShareGrant(user, report.shares);
      default:
        return false;
    }
  }

  private canAccessDashboard(
    user: SessionUser,
    folder: DashboardFolderRecordWithRelations,
    dashboard: DashboardFolderRecordWithRelations['dashboards'][number]
  ): boolean {
    if (this.isAdmin(user)) {
      return true;
    }

    if (!this.canAccessSourceReport(user, dashboard.sourceReport)) {
      return false;
    }

    if (dashboard.ownerContactId === user.sub) {
      return true;
    }

    if (!this.canAccessDashboardFolder(user, folder)) {
      return false;
    }

    switch (dashboard.shareMode) {
      case ReportShareMode.INHERIT:
        return true;
      case ReportShareMode.PERSONAL:
        return false;
      case ReportShareMode.RESTRICTED:
        return this.hasMatchingShareGrant(user, dashboard.shares);
      default:
        return false;
    }
  }

  private canManageDashboardFolder(user: SessionUser, folder: DashboardFolderRecordWithRelations, throwOnFailure: boolean): boolean {
    const allowed = this.isAdmin(user) || folder.ownerContactId === user.sub;
    if (!allowed && throwOnFailure) {
      throw new ForbiddenException('Only the owner or an admin can manage this folder');
    }

    return allowed;
  }

  private canManageDashboard(
    user: SessionUser,
    dashboard: Pick<DashboardRecordWithRelations, 'ownerContactId'>,
    throwOnFailure: boolean
  ): boolean {
    const allowed = this.isAdmin(user) || dashboard.ownerContactId === user.sub;
    if (!allowed && throwOnFailure) {
      throw new ForbiddenException('Only the owner or an admin can manage this dashboard');
    }

    return allowed;
  }

  private assertCanManageDashboardFolder(user: SessionUser, folder: DashboardFolderRecordWithRelations): void {
    this.canManageDashboardFolder(user, folder, true);
  }

  private assertCanManageDashboard(user: SessionUser, dashboard: DashboardRecordWithRelations): void {
    this.canManageDashboard(user, dashboard, true);
  }

  private assertCanViewDashboardFolder(user: SessionUser, folder: DashboardFolderRecordWithRelations): void {
    if (this.canAccessDashboardFolder(user, folder)) {
      return;
    }

    void this.auditWriteService.recordSecurityEventBestEffort({
      contactId: user.sub,
      eventType: 'DASHBOARD_ACCESS',
      decision: 'DENY',
      reasonCode: 'DASHBOARD_FOLDER_DENIED',
      metadata: {
        appId: folder.appId,
        folderId: folder.id
      }
    });
    throw new ForbiddenException('Dashboard folder access denied');
  }

  private assertCanViewDashboard(
    user: SessionUser,
    folder: DashboardRecordWithRelations['folder'],
    dashboard: DashboardRecordWithRelations
  ): void {
    const syntheticFolder = {
      ...folder,
      dashboards: [
        {
          ...dashboard,
          sourceReport: dashboard.sourceReport
        }
      ]
    } as unknown as DashboardFolderRecordWithRelations;

    if (this.canAccessDashboard(user, syntheticFolder, syntheticFolder.dashboards[0])) {
      return;
    }

    void this.auditWriteService.recordSecurityEventBestEffort({
      contactId: user.sub,
      eventType: 'DASHBOARD_ACCESS',
      decision: 'DENY',
      reasonCode: 'DASHBOARD_SHARE_DENIED',
      metadata: {
        appId: dashboard.appId,
        folderId: folder.id,
        dashboardId: dashboard.id,
        sourceReportId: dashboard.sourceReportId
      }
    });
    throw new ForbiddenException('Dashboard access denied');
  }

  private assertCanUseSourceReport(user: SessionUser, sourceReport: SourceReportRecord): void {
    if (this.canAccessSourceReport(user, sourceReport)) {
      return;
    }

    void this.auditWriteService.recordSecurityEventBestEffort({
      contactId: user.sub,
      eventType: 'DASHBOARD_ACCESS',
      decision: 'DENY',
      reasonCode: 'DASHBOARD_SOURCE_REPORT_DENIED',
      metadata: {
        appId: sourceReport.appId,
        reportId: sourceReport.id
      }
    });
    throw new ForbiddenException('Source report access denied');
  }

  private hasMatchingShareGrant(
    user: SessionUser,
    shares: Array<{ subjectType: ReportShareSubjectType; subjectId: string }>
  ): boolean {
    const normalizedPermissions = new Set(this.aclService.normalizePermissions(user.permissions));

    return shares.some((share) => {
      if (share.subjectType === ReportShareSubjectType.CONTACT) {
        return share.subjectId === user.sub;
      }

      return normalizedPermissions.has(share.subjectId);
    });
  }

  private isAdmin(user: SessionUser): boolean {
    return this.aclService.canAccess(user.permissions, 'rest:apps-admin');
  }

  private toFolderAccessMode(value: 'personal' | 'shared'): ReportFolderAccessMode {
    return value === 'shared' ? ReportFolderAccessMode.SHARED : ReportFolderAccessMode.PERSONAL;
  }

  private fromFolderAccessMode(value: ReportFolderAccessMode): 'personal' | 'shared' {
    return value === ReportFolderAccessMode.SHARED ? 'shared' : 'personal';
  }

  private toShareMode(value: 'inherit' | 'restricted' | 'personal'): ReportShareMode {
    switch (value) {
      case 'inherit':
        return ReportShareMode.INHERIT;
      case 'restricted':
        return ReportShareMode.RESTRICTED;
      case 'personal':
        return ReportShareMode.PERSONAL;
    }
  }

  private fromShareMode(value: ReportShareMode): 'inherit' | 'restricted' | 'personal' {
    switch (value) {
      case ReportShareMode.INHERIT:
        return 'inherit';
      case ReportShareMode.RESTRICTED:
        return 'restricted';
      case ReportShareMode.PERSONAL:
        return 'personal';
    }
  }

  private normalizeFolderAccessMode(value: unknown): 'personal' | 'shared' {
    const normalized = this.asOptionalString(value)?.toLowerCase() ?? 'personal';
    if (normalized !== 'personal' && normalized !== 'shared') {
      throw new BadRequestException('folder.accessMode is invalid');
    }

    return normalized;
  }

  private normalizeShareMode(value: unknown): 'inherit' | 'restricted' | 'personal' {
    const normalized = this.asOptionalString(value)?.toLowerCase() ?? 'inherit';
    if (normalized !== 'inherit' && normalized !== 'restricted' && normalized !== 'personal') {
      throw new BadRequestException('dashboard.shareMode is invalid');
    }

    return normalized;
  }

  private normalizeShareSubjectType(value: string, fieldName: string): 'contact' | 'permission' {
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'contact' && normalized !== 'permission') {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return normalized;
  }

  private toShareSubjectType(value: 'contact' | 'permission'): ReportShareSubjectType {
    return value === 'contact' ? ReportShareSubjectType.CONTACT : ReportShareSubjectType.PERMISSION;
  }

  private normalizeReportFilterOperator(value: ReportFilter['operator'], fieldName: string): ReportFilter['operator'] {
    switch (value) {
      case '=':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=':
      case 'IN':
      case 'NOT IN':
      case 'LIKE':
        return value;
      default:
        throw new BadRequestException(`${fieldName} is invalid`);
    }
  }

  private normalizeReportFilterValue(
    value: unknown,
    operator: ReportFilter['operator'],
    fieldName: string
  ): ReportScalarValue | ReportScalarValue[] {
    if (operator === 'IN' || operator === 'NOT IN') {
      if (!Array.isArray(value) || value.length === 0) {
        throw new BadRequestException(`${fieldName} must be a non-empty array`);
      }

      return value.map((entry, index) => this.normalizeScalarValue(entry, `${fieldName}[${index}]`));
    }

    return this.normalizeScalarValue(value, fieldName);
  }

  private normalizeScalarValue(value: unknown, fieldName: string): ReportScalarValue {
    if (value === null) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    throw new BadRequestException(`${fieldName} must be string, number, boolean, or null`);
  }

  private toEqualityReportFilter(filter: DashboardAppliedFilter): ReportFilter {
    return {
      field: filter.field,
      operator: '=',
      value: filter.value
    };
  }

  private requireObject(value: unknown, message: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(message);
    }

    return value as Record<string, unknown>;
  }

  private requireString(value: unknown, message: string): string {
    const normalized = this.asOptionalString(value);
    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private requireUuidString(value: unknown, fieldName: string): string {
    const normalized = this.requireString(value, `${fieldName} is required`);
    if (!UUID_PATTERN.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a UUID`);
    }

    return normalized;
  }

  private requireInteger(value: unknown, message: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new BadRequestException(message);
    }

    return value;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return undefined;
  }

  private assertUniqueFieldSequence(values: string[], fieldName: string): void {
    const normalizedValues = values.map((value) => value.trim());
    const uniqueValues = new Set(normalizedValues);
    if (uniqueValues.size !== normalizedValues.length) {
      throw new BadRequestException(`${fieldName} must not contain duplicates`);
    }
  }

  private buildShareGrantKey(share: ReportShareGrant): string {
    return `${share.subjectType}:${share.subjectId}`;
  }

  private buildScalarKey(value: ReportScalarValue): string {
    if (value === null) {
      return 'null';
    }

    return `${typeof value}:${String(value)}`;
  }

  private stringifyScalarValue(value: ReportScalarValue): string {
    if (value === null) {
      return 'Vuoto';
    }

    return String(value);
  }

  private toScalarValue(value: unknown): ReportScalarValue {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return JSON.stringify(value);
  }

  private toSafeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private buildSyntheticRowId(record: Record<string, unknown>): string {
    return JSON.stringify(record);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
