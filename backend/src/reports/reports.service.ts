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
import { SalesforceService, type SalesforceReadOnlyQueryResult } from '../salesforce/salesforce.service';
import type { VisibilityEvaluation } from '../visibility/visibility.types';

import type {
  ReportColumn,
  ReportContactSuggestionResponse,
  ReportDefinition,
  ReportFieldSuggestionResponse,
  ReportFilter,
  ReportFolderResponse,
  ReportFolderSummary,
  ReportGrouping,
  ReportObjectSuggestionResponse,
  ReportPermissionSuggestionResponse,
  ReportResponse,
  ReportRunColumn,
  ReportRunGroupNode,
  ReportRunResponse,
  ReportRunRow,
  ReportsWorkspaceResponse,
  ReportScalarValue,
  ReportShareGrant,
  ReportSort,
  ReportSummary
} from './reports.types';
import { ReportQueryCursorService } from './services/report-query-cursor.service';
import { ReportSoqlBuilderService } from './services/report-soql-builder.service';

const MAX_PAGE_SIZE = 2000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_REPORT_GROUPINGS = 2;
const SALESFORCE_ID_PATTERN = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;

type FolderRecordWithRelations = Prisma.ReportFolderRecordGetPayload<{
  include: {
    shares: true;
    reports: {
      include: {
        shares: true;
      };
      orderBy: {
        updatedAt: 'desc';
      };
    };
  };
}>;

type ReportRecordWithRelations = Prisma.ReportDefinitionRecordGetPayload<{
  include: {
    shares: true;
    folder: {
      include: {
        shares: true;
        reports: {
          include: {
            shares: true;
          };
          orderBy: {
            updatedAt: 'desc';
          };
        };
      };
    };
  };
}>;

interface ReportCursorExecutionInput {
  user: SessionUser;
  appId: string;
  reportId: string;
  pageSize: number;
  cursor?: string;
  objectApiName: string;
  resolvedSoql: string;
  baseWhere: string;
  finalWhere: string;
  visibility: VisibilityEvaluation;
  selectedFields: string[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly queryAuditService: QueryAuditService,
    private readonly salesforceService: SalesforceService,
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly aclService: AclService,
    private readonly auditWriteService: AuditWriteService,
    private readonly reportQueryCursorService: ReportQueryCursorService,
    private readonly reportSoqlBuilderService: ReportSoqlBuilderService
  ) {}

  async getWorkspace(user: SessionUser, appId: string): Promise<ReportsWorkspaceResponse> {
    await this.assertAppExists(appId);
    const folders = await this.listFoldersWithReports(appId);

    return {
      appId,
      canWrite: this.canWriteReports(user),
      folders: folders
        .filter((folder) => this.canAccessFolder(user, folder))
        .map((folder) => this.mapFolderSummary(user, folder))
    };
  }

  async getFolder(user: SessionUser, appId: string, folderId: string): Promise<ReportFolderResponse> {
    await this.assertAppExists(appId);
    const folder = await this.getFolderOrThrow(appId, folderId);
    this.assertCanViewFolder(user, folder);

    const reports = folder.reports
      .filter((report) => this.canAccessReport(user, folder, report))
      .map((report) => this.mapReportSummary(user, report, folder));

    return {
      canWrite: this.canWriteReports(user),
      folder: this.mapFolderSummary(user, folder),
      reports
    };
  }

  async createFolder(user: SessionUser, appId: string, payload: unknown): Promise<ReportFolderResponse> {
    await this.assertAppExists(appId);
    const normalized = this.normalizeFolderInput(payload);

    const created = await this.prismaService.reportFolderRecord.create({
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
        reports: {
          include: {
            shares: true
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'REPORT_FOLDER_CREATE',
      targetType: 'report-folder',
      targetId: created.id,
      payload,
      metadata: {
        appId,
        ownerContactId: user.sub,
        accessMode: normalized.accessMode,
        shareCount: normalized.shares.length
      }
    });

    return {
      canWrite: this.canWriteReports(user),
      folder: this.mapFolderSummary(user, created),
      reports: []
    };
  }

  async updateFolder(user: SessionUser, appId: string, folderId: string, payload: unknown): Promise<ReportFolderResponse> {
    await this.assertAppExists(appId);
    const existing = await this.getFolderOrThrow(appId, folderId);
    this.assertCanManageFolder(user, existing);
    const normalized = this.normalizeFolderInput(payload);

    await this.prismaService.$transaction(async (tx) => {
      await tx.reportFolderRecord.update({
        where: { id: folderId },
        data: {
          label: normalized.label,
          description: normalized.description ?? null,
          accessMode: this.toFolderAccessMode(normalized.accessMode)
        }
      });

      await tx.reportFolderShareRecord.deleteMany({
        where: {
          folderId
        }
      });

      if (normalized.accessMode === 'shared' && normalized.shares.length > 0) {
        await tx.reportFolderShareRecord.createMany({
          data: normalized.shares.map((share) => ({
            folderId,
            subjectType: this.toShareSubjectType(share.subjectType),
            subjectId: share.subjectId
          }))
        });
      }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'REPORT_FOLDER_UPDATE',
      targetType: 'report-folder',
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
    this.assertCanManageFolder(user, existing);

    await this.prismaService.reportFolderRecord.delete({
      where: { id: folderId }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'REPORT_FOLDER_DELETE',
      targetType: 'report-folder',
      targetId: folderId,
      metadata: {
        appId,
        reportCount: existing.reports.length
      }
    });
  }

  async updateFolderShares(user: SessionUser, appId: string, folderId: string, sharesPayload: unknown[]): Promise<ReportFolderResponse> {
    await this.assertAppExists(appId);
    const folder = await this.getFolderOrThrow(appId, folderId);
    this.assertCanManageFolder(user, folder);

    if (folder.accessMode !== ReportFolderAccessMode.SHARED) {
      throw new BadRequestException('Folder sharing can be updated only when accessMode is shared');
    }

    const shares = this.normalizeShareGrants(sharesPayload, 'shares');
    if (shares.length === 0) {
      throw new BadRequestException('Shared folder requires at least one share grant');
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.reportFolderShareRecord.deleteMany({
        where: { folderId }
      });
      await tx.reportFolderShareRecord.createMany({
        data: shares.map((share) => ({
          folderId,
          subjectType: this.toShareSubjectType(share.subjectType),
          subjectId: share.subjectId
        }))
      });
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'REPORT_FOLDER_SHARES_UPDATE',
      targetType: 'report-folder',
      targetId: folderId,
      payload: shares,
      metadata: {
        appId,
        shareCount: shares.length
      }
    });

    return this.getFolder(user, appId, folderId);
  }

  async createReport(user: SessionUser, appId: string, payload: unknown): Promise<ReportResponse> {
    await this.assertAppExists(appId);
    const normalized = this.normalizeReportInput(payload);
    const folder = await this.getFolderOrThrow(appId, normalized.folderId);
    this.assertCanManageFolder(user, folder);

    const created = await this.prismaService.reportDefinitionRecord.create({
      data: {
        appId,
        folderId: normalized.folderId,
        label: normalized.label,
        description: normalized.description ?? null,
        ownerContactId: user.sub,
        objectApiName: normalized.objectApiName,
        columnsJson: normalized.columns as unknown as Prisma.InputJsonValue,
        filtersJson: normalized.filters as unknown as Prisma.InputJsonValue,
        groupingsJson: normalized.groupings as unknown as Prisma.InputJsonValue,
        sortJson: normalized.sort as unknown as Prisma.InputJsonValue,
        pageSize: normalized.pageSize,
        shareMode: this.toReportShareMode(normalized.shareMode),
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
            reports: {
              include: {
                shares: true
              },
              orderBy: {
                updatedAt: 'desc'
              }
            }
          }
        }
      }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'REPORT_CREATE',
      targetType: 'report-definition',
      targetId: created.id,
      payload,
      metadata: {
        appId,
        folderId: normalized.folderId,
        ownerContactId: user.sub,
        objectApiName: normalized.objectApiName,
        columnCount: normalized.columns.length,
        filterCount: normalized.filters.length,
        groupingCount: normalized.groupings.length,
        sortCount: normalized.sort.length,
        shareMode: normalized.shareMode,
        shareCount: normalized.shares.length
      }
    });

    return this.getReport(user, appId, created.id);
  }

  async getReport(user: SessionUser, appId: string, reportId: string): Promise<ReportResponse> {
    await this.assertAppExists(appId);
    const report = await this.getReportOrThrow(appId, reportId);
    this.assertCanViewReport(user, report.folder, report);

    return {
      canWrite: this.canWriteReports(user),
      report: this.mapReportDefinition(user, report, report.folder)
    };
  }

  async updateReport(user: SessionUser, appId: string, reportId: string, payload: unknown): Promise<ReportResponse> {
    await this.assertAppExists(appId);
    const existing = await this.getReportOrThrow(appId, reportId);
    this.assertCanManageReport(user, existing);
    const normalized = this.normalizeReportInput(payload, existing);
    const targetFolder = await this.getFolderOrThrow(appId, normalized.folderId);
    this.assertCanManageFolder(user, targetFolder);

    await this.prismaService.$transaction(async (tx) => {
      await tx.reportDefinitionRecord.update({
        where: { id: reportId },
        data: {
          folderId: normalized.folderId,
          label: normalized.label,
          description: normalized.description ?? null,
          columnsJson: normalized.columns as unknown as Prisma.InputJsonValue,
          filtersJson: normalized.filters as unknown as Prisma.InputJsonValue,
          groupingsJson: normalized.groupings as unknown as Prisma.InputJsonValue,
          sortJson: normalized.sort as unknown as Prisma.InputJsonValue,
          pageSize: normalized.pageSize,
          shareMode: this.toReportShareMode(normalized.shareMode)
        }
      });

      await tx.reportDefinitionShareRecord.deleteMany({
        where: { reportId }
      });

      if (normalized.shareMode === 'restricted' && normalized.shares.length > 0) {
        await tx.reportDefinitionShareRecord.createMany({
          data: normalized.shares.map((share) => ({
            reportId,
            subjectType: this.toShareSubjectType(share.subjectType),
            subjectId: share.subjectId
          }))
        });
      }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'REPORT_UPDATE',
      targetType: 'report-definition',
      targetId: reportId,
      payload,
      metadata: {
        appId,
        folderId: normalized.folderId,
        ownerContactId: existing.ownerContactId,
        objectApiName: existing.objectApiName,
        columnCount: normalized.columns.length,
        filterCount: normalized.filters.length,
        groupingCount: normalized.groupings.length,
        sortCount: normalized.sort.length,
        shareMode: normalized.shareMode,
        shareCount: normalized.shares.length
      }
    });

    return this.getReport(user, appId, reportId);
  }

  async deleteReport(user: SessionUser, appId: string, reportId: string): Promise<void> {
    await this.assertAppExists(appId);
    const existing = await this.getReportOrThrow(appId, reportId);
    this.assertCanManageReport(user, existing);

    await this.prismaService.reportDefinitionRecord.delete({
      where: { id: reportId }
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'REPORT_DELETE',
      targetType: 'report-definition',
      targetId: reportId,
      metadata: {
        appId,
        folderId: existing.folderId,
        objectApiName: existing.objectApiName
      }
    });
  }

  async updateReportShares(user: SessionUser, appId: string, reportId: string, sharesPayload: unknown[]): Promise<ReportResponse> {
    await this.assertAppExists(appId);
    const report = await this.getReportOrThrow(appId, reportId);
    this.assertCanManageReport(user, report);

    if (report.shareMode !== ReportShareMode.RESTRICTED) {
      throw new BadRequestException('Report shares can be updated only when shareMode is restricted');
    }

    const shares = this.normalizeShareGrants(sharesPayload, 'shares');
    if (shares.length === 0) {
      throw new BadRequestException('Restricted report requires at least one share grant');
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.reportDefinitionShareRecord.deleteMany({
        where: { reportId }
      });

      await tx.reportDefinitionShareRecord.createMany({
        data: shares.map((share) => ({
          reportId,
          subjectType: this.toShareSubjectType(share.subjectType),
          subjectId: share.subjectId
        }))
      });
    });

    await this.auditWriteService.recordApplicationSuccessOrThrow({
      action: 'REPORT_SHARES_UPDATE',
      targetType: 'report-definition',
      targetId: reportId,
      payload: shares,
      metadata: {
        appId,
        shareCount: shares.length
      }
    });

    return this.getReport(user, appId, reportId);
  }

  async runReport(user: SessionUser, appId: string, reportId: string, cursor: string | undefined): Promise<ReportRunResponse> {
    await this.assertAppExists(appId);
    await this.reportQueryCursorService.deleteExpiredCursors();
    const reportRecord = await this.getReportOrThrow(appId, reportId);
    this.assertCanViewReport(user, reportRecord.folder, reportRecord);
    const report = this.mapReportDefinition(user, reportRecord, reportRecord.folder);
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      'rest:reports-read',
      report.objectApiName,
      {
        queryKind: 'REPORT_RUN'
      }
    );

    const compiled = this.reportSoqlBuilderService.buildReportQueries(report, visibility);
    const paginationResult = await this.executeCursorPaginatedQuery({
      user,
      appId,
      reportId,
      pageSize: report.pageSize,
      cursor,
      objectApiName: report.objectApiName,
      resolvedSoql: compiled.soql,
      baseWhere: compiled.baseWhere ?? '',
      finalWhere: compiled.finalWhere ?? '',
      visibility,
      selectedFields: compiled.selectedFields
    });
    const rows = this.mapRunRows(paginationResult.records, compiled.visibleColumns);
    const groups = compiled.visibleGroupings.length > 0
      ? this.buildGroupTree(
          paginationResult.records,
          compiled.visibleGroupings,
          await this.loadGroupCounts(compiled.countSoql ?? '', compiled.visibleGroupings)
        )
      : [];

    return {
      report,
      columns: compiled.visibleColumns.map((column) => ({
        field: column.field,
        label: column.label?.trim() || column.field
      })),
      rows,
      groups,
      total: paginationResult.totalSize,
      pageSize: report.pageSize,
      nextCursor: paginationResult.nextCursor,
      visibility
    };
  }

  async searchContacts(_user: SessionUser, appId: string, query: string, limit: number | undefined): Promise<ReportContactSuggestionResponse> {
    await this.assertAppExists(appId);
    return {
      items: await this.salesforceService.searchContactsByIdOrName(query, limit ?? 8)
    };
  }

  async searchPermissions(_user: SessionUser, appId: string, query: string, limit: number | undefined): Promise<ReportPermissionSuggestionResponse> {
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

  async searchObjectApiNames(_user: SessionUser, appId: string, query: string, limit: number | undefined): Promise<ReportObjectSuggestionResponse> {
    await this.assertAppExists(appId);
    const normalizedQuery = query.trim().toLowerCase();
    const maxItems = this.clamp(limit ?? 20, 1, 25);
    const items = await this.salesforceService.describeGlobalObjects();

    return {
      items: items
        .filter((entry) =>
          entry.name.toLowerCase().includes(normalizedQuery) ||
          entry.label.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, maxItems)
    };
  }

  async searchObjectFields(_user: SessionUser, appId: string, objectApiName: string, query: string | undefined, limit: number | undefined): Promise<ReportFieldSuggestionResponse> {
    await this.assertAppExists(appId);
    const normalizedQuery = query?.trim().toLowerCase() ?? '';
    const maxItems = this.clamp(limit ?? 25, 1, 50);
    const fields = await this.salesforceService.describeObjectFields(objectApiName.trim());

    return {
      items: fields
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

  private async listFoldersWithReports(appId: string): Promise<FolderRecordWithRelations[]> {
    return this.prismaService.reportFolderRecord.findMany({
      where: { appId },
      include: {
        shares: true,
        reports: {
          include: {
            shares: true
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      },
      orderBy: [{ label: 'asc' }, { updatedAt: 'desc' }]
    });
  }

  private async getFolderOrThrow(appId: string, folderId: string): Promise<FolderRecordWithRelations> {
    const folder = await this.prismaService.reportFolderRecord.findFirst({
      where: {
        id: folderId,
        appId
      },
      include: {
        shares: true,
        reports: {
          include: {
            shares: true
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      }
    });

    if (!folder) {
      throw new NotFoundException(`Report folder ${folderId} not found`);
    }

    return folder;
  }

  private async getReportOrThrow(appId: string, reportId: string): Promise<ReportRecordWithRelations> {
    const report = await this.prismaService.reportDefinitionRecord.findFirst({
      where: {
        id: reportId,
        appId
      },
      include: {
        shares: true,
        folder: {
          include: {
            shares: true,
            reports: {
              include: {
                shares: true
              },
              orderBy: {
                updatedAt: 'desc'
              }
            }
          }
        }
      }
    });

    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    return report;
  }

  private async assertAppExists(appId: string): Promise<void> {
    this.resourceAccessService.assertKebabCaseId(appId, 'appId');
    if (!(await this.appsAdminConfigRepository.hasApp(appId))) {
      throw new NotFoundException(`App config ${appId} not found`);
    }
  }

  private mapFolderSummary(user: SessionUser, folder: FolderRecordWithRelations): ReportFolderSummary {
    return {
      id: folder.id,
      appId: folder.appId,
      label: folder.label,
      description: folder.description ?? undefined,
      ownerContactId: folder.ownerContactId,
      accessMode: this.fromFolderAccessMode(folder.accessMode),
      shares: folder.shares.map((share) => this.mapShareGrant(share)),
      reportCount: folder.reports.filter((report) => this.canAccessReport(user, folder, report)).length,
      canEdit: this.canManageFolder(user, folder, false),
      canShare: this.canManageFolder(user, folder, false),
      updatedAt: folder.updatedAt.toISOString()
    };
  }

  private mapReportSummary(
    user: SessionUser,
    report: FolderRecordWithRelations['reports'][number],
    folder: FolderRecordWithRelations
  ): ReportSummary {
    const columns = this.readColumns(report.columnsJson, `report ${report.id}.columns`);
    const groupings = this.readGroupings(report.groupingsJson, `report ${report.id}.groupings`);

    return {
      id: report.id,
      appId: report.appId,
      folderId: report.folderId,
      label: report.label,
      description: report.description ?? undefined,
      ownerContactId: report.ownerContactId,
      objectApiName: report.objectApiName,
      columns,
      groupings,
      shareMode: this.fromReportShareMode(report.shareMode),
      canEdit: this.canManageReport(user, report, false),
      canShare: this.canManageReport(user, report, false),
      updatedAt: report.updatedAt.toISOString()
    };
  }

  private mapReportDefinition(user: SessionUser, report: ReportRecordWithRelations, folder: FolderRecordWithRelations): ReportDefinition {
    return {
      ...this.mapReportSummary(user, report, folder),
      filters: this.readFilters(report.filtersJson, `report ${report.id}.filters`),
      sort: this.readSort(report.sortJson, `report ${report.id}.sort`),
      pageSize: this.clamp(report.pageSize, 1, MAX_PAGE_SIZE),
      shares: report.shares.map((share) => this.mapShareGrant(share))
    };
  }

  private mapShareGrant(
    share:
      | FolderRecordWithRelations['shares'][number]
      | ReportRecordWithRelations['shares'][number]
  ): ReportShareGrant {
    return {
      subjectType: share.subjectType === ReportShareSubjectType.CONTACT ? 'contact' : 'permission',
      subjectId: share.subjectId
    };
  }

  private normalizeFolderInput(value: unknown): {
    label: string;
    description?: string;
    accessMode: 'personal' | 'shared';
    shares: ReportShareGrant[];
  } {
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

  private normalizeReportInput(
    value: unknown,
    existing?: Pick<ReportRecordWithRelations, 'objectApiName'>
  ): {
    folderId: string;
    label: string;
    description?: string;
    objectApiName: string;
    columns: ReportColumn[];
    filters: ReportFilter[];
    groupings: ReportGrouping[];
    sort: ReportSort[];
    pageSize: number;
    shareMode: 'inherit' | 'restricted' | 'personal';
    shares: ReportShareGrant[];
  } {
    const payload = this.requireObject(value, 'report payload must be an object');
    const folderId = this.requireUuidString(payload.folderId, 'report.folderId');
    const label = this.requireString(payload.label, 'report.label is required');
    const objectApiName = this.normalizeReportObjectApiName(payload.objectApiName, existing?.objectApiName);
    const columns = this.normalizeColumns(payload.columns);
    const filters = this.normalizeFilters(payload.filters);
    const groupings = this.normalizeGroupings(payload.groupings);
    const sort = this.normalizeSort(payload.sort);
    const pageSize = this.normalizePageSize(payload.pageSize);
    const shareMode = this.normalizeReportShareMode(payload.shareMode);
    const shares = this.normalizeShareGrants(Array.isArray(payload.shares) ? payload.shares : [], 'report.shares');

    if ((shareMode === 'inherit' || shareMode === 'personal') && shares.length > 0) {
      throw new BadRequestException(`Report shareMode ${shareMode} does not accept explicit share grants`);
    }

    if (shareMode === 'restricted' && shares.length === 0) {
      throw new BadRequestException('Restricted report requires at least one share grant');
    }

    return {
      folderId,
      label,
      description: this.asOptionalString(payload.description),
      objectApiName,
      columns,
      filters,
      groupings,
      sort,
      pageSize,
      shareMode,
      shares
    };
  }

  private normalizeColumns(value: unknown): ReportColumn[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('report.columns must be an array');
    }

    const columns = value.map((entry, index) => {
      const column = this.requireObject(entry, `report.columns[${index}] must be an object`);
      return {
        field: this.requireString(column.field, `report.columns[${index}].field is required`),
        label: this.asOptionalString(column.label)
      } satisfies ReportColumn;
    });

    if (columns.length === 0) {
      throw new BadRequestException('report.columns must contain at least one field');
    }

    this.assertUniqueFieldSequence(columns.map((column) => column.field), 'report.columns');
    return columns;
  }

  private normalizeFilters(value: unknown): ReportFilter[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('report.filters must be an array');
    }

    return value.map((entry, index) => {
      const filter = this.requireObject(entry, `report.filters[${index}] must be an object`);
      const operator = this.requireString(filter.operator, `report.filters[${index}].operator is required`) as ReportFilter['operator'];
      const normalizedOperator = this.normalizeFilterOperator(operator, `report.filters[${index}].operator`);
      const normalizedValue = this.normalizeFilterValue(filter.value, normalizedOperator, `report.filters[${index}].value`);

      return {
        field: this.requireString(filter.field, `report.filters[${index}].field is required`),
        operator: normalizedOperator,
        value: normalizedValue
      };
    });
  }

  private normalizeGroupings(value: unknown): ReportGrouping[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('report.groupings must be an array');
    }

    if (value.length > MAX_REPORT_GROUPINGS) {
      throw new BadRequestException(`report.groupings supports at most ${MAX_REPORT_GROUPINGS} levels`);
    }

    const groupings = value.map((entry, index) => {
      const grouping = this.requireObject(entry, `report.groupings[${index}] must be an object`);
      return {
        field: this.requireString(grouping.field, `report.groupings[${index}].field is required`),
        label: this.asOptionalString(grouping.label)
      } satisfies ReportGrouping;
    });

    this.assertUniqueFieldSequence(groupings.map((grouping) => grouping.field), 'report.groupings');
    return groupings;
  }

  private normalizeSort(value: unknown): ReportSort[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('report.sort must be an array');
    }

    const sort = value.map((entry, index) => {
      const row = this.requireObject(entry, `report.sort[${index}] must be an object`);
      const direction = this.asOptionalString(row.direction);
      if (direction && direction.toUpperCase() !== 'ASC' && direction.toUpperCase() !== 'DESC') {
        throw new BadRequestException(`report.sort[${index}].direction is invalid`);
      }

      return {
        field: this.requireString(row.field, `report.sort[${index}].field is required`),
        direction: direction ? (direction.toUpperCase() as 'ASC' | 'DESC') : undefined
      } satisfies ReportSort;
    });

    this.assertUniqueFieldSequence(sort.map((entry) => entry.field), 'report.sort');
    return sort;
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

    const uniqueKeys = new Set(shares.map((share) => `${share.subjectType}:${share.subjectId}`));
    if (uniqueKeys.size !== shares.length) {
      throw new BadRequestException(`${fieldName} must not contain duplicates`);
    }

    return shares;
  }

  private normalizeReportObjectApiName(value: unknown, existingObjectApiName: string | undefined): string {
    if (existingObjectApiName) {
      const nextValue = this.asOptionalString(value);
      if (!nextValue) {
        return existingObjectApiName;
      }

      if (nextValue !== existingObjectApiName) {
        throw new BadRequestException('report.objectApiName cannot change after creation');
      }

      return existingObjectApiName;
    }

    return this.requireString(value, 'report.objectApiName is required');
  }

  private normalizeFolderAccessMode(value: unknown): 'personal' | 'shared' {
    const normalized = this.asOptionalString(value)?.toLowerCase() ?? 'personal';
    if (normalized !== 'personal' && normalized !== 'shared') {
      throw new BadRequestException('folder.accessMode is invalid');
    }

    return normalized;
  }

  private normalizeReportShareMode(value: unknown): 'inherit' | 'restricted' | 'personal' {
    const normalized = this.asOptionalString(value)?.toLowerCase() ?? 'inherit';
    if (normalized !== 'inherit' && normalized !== 'restricted' && normalized !== 'personal') {
      throw new BadRequestException('report.shareMode is invalid');
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

  private normalizeFilterOperator(value: string, fieldName: string): ReportFilter['operator'] {
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

  private normalizeFilterValue(value: unknown, operator: ReportFilter['operator'], fieldName: string): ReportScalarValue | ReportScalarValue[] {
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

  private normalizePageSize(value: unknown): number {
    if (value === undefined || value === null || value === '') {
      return DEFAULT_PAGE_SIZE;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
      throw new BadRequestException(`report.pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
    }

    return value;
  }

  private readColumns(value: Prisma.JsonValue, fieldName: string): ReportColumn[] {
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

  private readFilters(value: Prisma.JsonValue, fieldName: string): ReportFilter[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const filter = this.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const operator = this.normalizeFilterOperator(
        this.requireString(filter.operator, `${fieldName}[${index}].operator is required`),
        `${fieldName}[${index}].operator`
      );

      return {
        field: this.requireString(filter.field, `${fieldName}[${index}].field is required`),
        operator,
        value: this.normalizeFilterValue(filter.value, operator, `${fieldName}[${index}].value`)
      };
    });
  }

  private readGroupings(value: Prisma.JsonValue, fieldName: string): ReportGrouping[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const grouping = this.requireObject(entry, `${fieldName}[${index}] must be an object`);
      return {
        field: this.requireString(grouping.field, `${fieldName}[${index}].field is required`),
        label: this.asOptionalString(grouping.label)
      };
    });
  }

  private readSort(value: Prisma.JsonValue, fieldName: string): ReportSort[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return value.map((entry, index) => {
      const sort = this.requireObject(entry, `${fieldName}[${index}] must be an object`);
      const direction = this.asOptionalString(sort.direction);
      return {
        field: this.requireString(sort.field, `${fieldName}[${index}].field is required`),
        direction: direction ? (direction.toUpperCase() as 'ASC' | 'DESC') : undefined
      };
    });
  }

  private async executeCursorPaginatedQuery(
    input: ReportCursorExecutionInput
  ): Promise<{ records: Array<Record<string, unknown>>; totalSize: number; nextCursor: string | null }> {
    const queryFingerprint = this.buildQueryFingerprint(input);

    if (input.cursor) {
      const cursor = await this.reportQueryCursorService.readCursor(input.cursor);
      this.assertCursorMatches(cursor, input, queryFingerprint);

      return this.materializeCursorPage({
        input,
        sourceLocator: cursor.sourceLocator,
        sourceRecords: cursor.sourceRecords,
        totalSize: cursor.totalSize,
        queryFingerprint
      });
    }

    const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryPageWithAudit({
      contactId: input.user.sub,
      queryKind: 'REPORT_RUN',
      targetId: input.reportId,
      objectApiName: input.objectApiName,
      resolvedSoql: input.resolvedSoql,
      visibility: input.visibility,
      baseWhere: input.baseWhere,
      finalWhere: input.finalWhere,
      pageSize: input.pageSize,
      metadata: {
        appId: input.appId,
        reportId: input.reportId,
        paginationMode: 'cursor',
        cursorPhase: 'initial',
        selectedFields: input.selectedFields
      }
    });
    const { records, totalSize } = this.extractRecords(rawQueryResult);
    const pageRecords = records.slice(0, input.pageSize);
    const remainingRecords = records.slice(input.pageSize);
    const nextCursor =
      remainingRecords.length > 0 || rawQueryResult.nextRecordsUrl
        ? await this.reportQueryCursorService.createCursor(
            {
              contactId: input.user.sub,
              appId: input.appId,
              reportId: input.reportId,
              objectApiName: input.objectApiName,
              pageSize: input.pageSize,
              totalSize,
              resolvedSoql: input.resolvedSoql,
              baseWhere: input.baseWhere,
              finalWhere: input.finalWhere,
              queryFingerprint
            },
            {
              sourceLocator: rawQueryResult.nextRecordsUrl,
              sourceRecords: remainingRecords
            }
          )
        : null;

    return {
      records: pageRecords,
      totalSize,
      nextCursor
    };
  }

  private async materializeCursorPage(params: {
    input: ReportCursorExecutionInput;
    sourceLocator?: string;
    sourceRecords: Array<Record<string, unknown>>;
    totalSize: number;
    queryFingerprint: string;
  }): Promise<{ records: Array<Record<string, unknown>>; totalSize: number; nextCursor: string | null }> {
    const workingRecords = [...params.sourceRecords];
    let locator = params.sourceLocator;

    while (workingRecords.length < params.input.pageSize && locator) {
      const rawQueryResult = await this.queryAuditService.executeReadOnlyQueryMoreWithAudit({
        contactId: params.input.user.sub,
        queryKind: 'REPORT_RUN',
        targetId: params.input.reportId,
        objectApiName: params.input.objectApiName,
        resolvedSoql: params.input.resolvedSoql,
        visibility: params.input.visibility,
        baseWhere: params.input.baseWhere,
        finalWhere: params.input.finalWhere,
        locator,
        pageSize: params.input.pageSize,
        metadata: {
          appId: params.input.appId,
          reportId: params.input.reportId,
          paginationMode: 'cursor',
          cursorPhase: 'continue',
          selectedFields: params.input.selectedFields
        }
      });
      const { records } = this.extractRecords(rawQueryResult);
      workingRecords.push(...records);
      locator = rawQueryResult.nextRecordsUrl;
    }

    const pageRecords = workingRecords.slice(0, params.input.pageSize);
    const remainingRecords = workingRecords.slice(params.input.pageSize);
    const nextCursor =
      remainingRecords.length > 0 || locator
        ? await this.reportQueryCursorService.createCursor(
            {
              contactId: params.input.user.sub,
              appId: params.input.appId,
              reportId: params.input.reportId,
              objectApiName: params.input.objectApiName,
              pageSize: params.input.pageSize,
              totalSize: params.totalSize,
              resolvedSoql: params.input.resolvedSoql,
              baseWhere: params.input.baseWhere,
              finalWhere: params.input.finalWhere,
              queryFingerprint: params.queryFingerprint
            },
            {
              sourceLocator: locator,
              sourceRecords: remainingRecords
            }
          )
        : null;

    return {
      records: pageRecords,
      totalSize: params.totalSize,
      nextCursor
    };
  }

  private buildQueryFingerprint(input: ReportCursorExecutionInput): string {
    return this.reportQueryCursorService.hashFingerprint([
      input.user.sub,
      input.appId,
      input.reportId,
      input.pageSize,
      input.objectApiName,
      input.resolvedSoql,
      input.baseWhere,
      input.finalWhere,
      input.visibility.permissionsHash,
      input.visibility.policyVersion,
      input.visibility.objectPolicyVersion,
      input.visibility.compiledPredicate,
      (input.visibility.compiledFields ?? []).join(','),
      input.selectedFields.join(',')
    ]);
  }

  private assertCursorMatches(
    cursor: Awaited<ReturnType<ReportQueryCursorService['readCursor']>>,
    input: ReportCursorExecutionInput,
    queryFingerprint: string
  ): void {
    if (
      cursor.contactId !== input.user.sub ||
      cursor.appId !== input.appId ||
      cursor.reportId !== input.reportId ||
      cursor.pageSize !== input.pageSize ||
      cursor.objectApiName !== input.objectApiName ||
      cursor.queryFingerprint !== queryFingerprint
    ) {
      throw new BadRequestException('Invalid or expired report cursor');
    }
  }

  private async loadGroupCounts(soql: string, groupings: ReportGrouping[]): Promise<Map<string, number>> {
    if (!soql || groupings.length === 0) {
      return new Map<string, number>();
    }

    const rawResult = await this.salesforceService.executeReadOnlyQuery(soql);
    const { records } = this.extractRecords(rawResult);
    const counts = new Map<string, number>();

    for (const record of records) {
      const key = this.buildGroupingKey(groupings.map((grouping) => record[grouping.field]));
      const countValue = record.groupedCount;
      const parsedCount = typeof countValue === 'number' ? countValue : Number(countValue);
      counts.set(key, Number.isFinite(parsedCount) ? parsedCount : 0);
    }

    return counts;
  }

  private buildGroupTree(
    records: Array<Record<string, unknown>>,
    groupings: ReportGrouping[],
    countsByKey: Map<string, number>,
    level = 0,
    prefixValues: unknown[] = []
  ): ReportRunGroupNode[] {
    if (level >= groupings.length) {
      return [];
    }

    const grouping = groupings[level];
    const buckets = new Map<string, { value: unknown; records: Array<Record<string, unknown>> }>();

    for (const record of records) {
      const value = record[grouping.field];
      const bucketKey = this.stringifyGroupValue(value);
      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.records.push(record);
        continue;
      }

      buckets.set(bucketKey, {
        value,
        records: [record]
      });
    }

    return [...buckets.values()].map((bucket) => {
      const keyParts = [...prefixValues, bucket.value];
      const key = this.buildGroupingKey(keyParts);
      const children = this.buildGroupTree(bucket.records, groupings, countsByKey, level + 1, keyParts);

      return {
        key,
        field: grouping.field,
        label: grouping.label?.trim() || grouping.field,
        value: bucket.value,
        count: countsByKey.get(key) ?? bucket.records.length,
        children: children.length > 0 ? children : undefined,
        rowIds: children.length === 0
          ? bucket.records
              .map((record) => String(record.Id ?? ''))
              .filter((value) => value.length > 0)
          : undefined
      } satisfies ReportRunGroupNode;
    });
  }

  private mapRunRows(records: Array<Record<string, unknown>>, columns: ReportColumn[]): ReportRunRow[] {
    return records.map((record) => ({
      id: typeof record.Id === 'string' ? record.Id : this.buildSyntheticRowId(record),
      values: Object.fromEntries(
        columns.map((column) => [column.field, record[column.field]])
      )
    }));
  }

  private extractRecords(result: unknown): { records: Array<Record<string, unknown>>; totalSize: number } {
    if (!this.isObjectRecord(result)) {
      return { records: [], totalSize: 0 };
    }

    const rawRecords = result.records;
    const records = Array.isArray(rawRecords)
      ? rawRecords.filter((record): record is Record<string, unknown> => this.isObjectRecord(record))
      : [];
    const totalSize = typeof result.totalSize === 'number' ? result.totalSize : records.length;

    return { records, totalSize };
  }

  private canWriteReports(user: SessionUser): boolean {
    return this.aclService.canAccess(user.permissions, 'rest:reports-write');
  }

  private canAccessFolder(user: SessionUser, folder: FolderRecordWithRelations): boolean {
    if (this.isAdmin(user) || folder.ownerContactId === user.sub) {
      return true;
    }

    if (folder.accessMode === ReportFolderAccessMode.PERSONAL) {
      return false;
    }

    return this.hasMatchingShareGrant(user, folder.shares);
  }

  private canAccessReport(
    user: SessionUser,
    folder: FolderRecordWithRelations,
    report: FolderRecordWithRelations['reports'][number]
  ): boolean {
    if (this.isAdmin(user) || report.ownerContactId === user.sub) {
      return true;
    }

    if (!this.canAccessFolder(user, folder)) {
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

  private canManageFolder(user: SessionUser, folder: FolderRecordWithRelations, throwOnFailure: boolean): boolean {
    const allowed = this.isAdmin(user) || folder.ownerContactId === user.sub;
    if (!allowed && throwOnFailure) {
      throw new ForbiddenException('Only the owner or an admin can manage this folder');
    }

    return allowed;
  }

  private canManageReport(
    user: SessionUser,
    report: Pick<ReportRecordWithRelations, 'ownerContactId'>,
    throwOnFailure: boolean
  ): boolean {
    const allowed = this.isAdmin(user) || report.ownerContactId === user.sub;
    if (!allowed && throwOnFailure) {
      throw new ForbiddenException('Only the owner or an admin can manage this report');
    }

    return allowed;
  }

  private assertCanManageFolder(user: SessionUser, folder: FolderRecordWithRelations): void {
    this.canManageFolder(user, folder, true);
  }

  private assertCanManageReport(user: SessionUser, report: ReportRecordWithRelations): void {
    this.canManageReport(user, report, true);
  }

  private assertCanViewFolder(user: SessionUser, folder: FolderRecordWithRelations): void {
    if (this.canAccessFolder(user, folder)) {
      return;
    }

    void this.auditWriteService.recordSecurityEventBestEffort({
      contactId: user.sub,
      eventType: 'REPORT_ACCESS',
      decision: 'DENY',
      reasonCode: 'REPORT_FOLDER_DENIED',
      metadata: {
        appId: folder.appId,
        folderId: folder.id
      }
    });
    throw new ForbiddenException('Folder access denied');
  }

  private assertCanViewReport(user: SessionUser, folder: FolderRecordWithRelations, report: ReportRecordWithRelations): void {
    if (this.canAccessReport(user, folder, report)) {
      return;
    }

    void this.auditWriteService.recordSecurityEventBestEffort({
      contactId: user.sub,
      eventType: 'REPORT_ACCESS',
      decision: 'DENY',
      reasonCode: 'REPORT_SHARE_DENIED',
      metadata: {
        appId: report.appId,
        folderId: folder.id,
        reportId: report.id
      }
    });
    throw new ForbiddenException('Report access denied');
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

  private buildGroupingKey(values: unknown[]): string {
    return values.map((value) => this.stringifyGroupValue(value)).join('||');
  }

  private stringifyGroupValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '__null__';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value);
  }

  private buildSyntheticRowId(record: Record<string, unknown>): string {
    return this.reportQueryCursorService.hashFingerprint(Object.values(record).map((value) => {
      if (value === null || value === undefined) {
        return '';
      }

      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : JSON.stringify(value);
    }));
  }

  private toFolderAccessMode(value: 'personal' | 'shared'): ReportFolderAccessMode {
    return value === 'shared' ? ReportFolderAccessMode.SHARED : ReportFolderAccessMode.PERSONAL;
  }

  private fromFolderAccessMode(value: ReportFolderAccessMode): 'personal' | 'shared' {
    return value === ReportFolderAccessMode.SHARED ? 'shared' : 'personal';
  }

  private toReportShareMode(value: 'inherit' | 'restricted' | 'personal'): ReportShareMode {
    switch (value) {
      case 'restricted':
        return ReportShareMode.RESTRICTED;
      case 'personal':
        return ReportShareMode.PERSONAL;
      default:
        return ReportShareMode.INHERIT;
    }
  }

  private fromReportShareMode(value: ReportShareMode): 'inherit' | 'restricted' | 'personal' {
    switch (value) {
      case ReportShareMode.RESTRICTED:
        return 'restricted';
      case ReportShareMode.PERSONAL:
        return 'personal';
      default:
        return 'inherit';
    }
  }

  private toShareSubjectType(value: 'contact' | 'permission'): ReportShareSubjectType {
    return value === 'permission' ? ReportShareSubjectType.PERMISSION : ReportShareSubjectType.CONTACT;
  }

  private assertUniqueFieldSequence(values: string[], fieldName: string): void {
    const normalized = values.map((value) => value.trim()).filter((value) => value.length > 0);
    const unique = new Set(normalized);
    if (unique.size !== normalized.length) {
      throw new BadRequestException(`${fieldName} must not contain duplicate fields`);
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private requireObject(value: unknown, message: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new BadRequestException(message);
    }

    return value as Record<string, unknown>;
  }

  private requireString(value: unknown, message: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private requireUuidString(value: unknown, fieldName: string): string {
    const normalized = this.requireString(value, `${fieldName} is required`);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID`);
    }

    return normalized;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
