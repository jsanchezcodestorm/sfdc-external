import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ReportFolderAccessMode,
  ReportShareMode,
  type Prisma
} from '@prisma/client';

import { AclConfigRepository } from '../acl/acl-config.repository';
import { AppsAdminConfigRepository } from '../apps/apps-admin-config.repository';
import { AuditWriteService } from '../audit/audit-write.service';
import type { SessionUser } from '../auth/session-user.interface';
import { ResourceAccessService } from '../common/services/resource-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesforceService } from '../salesforce/salesforce.service';

import type { FolderRecordWithRelations, ReportRecordWithRelations } from './report-record.types';
import type {
  ReportContactSuggestionResponse,
  ReportFieldSuggestionResponse,
  ReportFolderResponse,
  ReportObjectSuggestionResponse,
  ReportPermissionSuggestionResponse,
  ReportResponse,
  ReportRunResponse,
  ReportsWorkspaceResponse
} from './reports.types';
import { ReportAccessPolicyService } from './services/report-access-policy.service';
import { ReportInputNormalizerService } from './services/report-input-normalizer.service';
import { ReportResponseMapperService } from './services/report-response-mapper.service';
import { ReportRunnerService } from './services/report-runner.service';

@Injectable()
export class ReportsRuntimeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly appsAdminConfigRepository: AppsAdminConfigRepository,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly salesforceService: SalesforceService,
    private readonly aclConfigRepository: AclConfigRepository,
    private readonly auditWriteService: AuditWriteService,
    private readonly accessPolicy: ReportAccessPolicyService,
    private readonly inputNormalizer: ReportInputNormalizerService,
    private readonly responseMapper: ReportResponseMapperService,
    private readonly reportRunner: ReportRunnerService
  ) {}

  async getWorkspace(user: SessionUser, appId: string): Promise<ReportsWorkspaceResponse> {
    await this.assertAppExists(appId);
    const folders = await this.listFoldersWithReports(appId);

    return {
      appId,
      canWrite: this.accessPolicy.canWriteReports(user),
      folders: folders
        .filter((folder) => this.accessPolicy.canAccessFolder(user, folder))
        .map((folder) => this.responseMapper.mapFolderSummary(user, folder))
    };
  }

  async getFolder(user: SessionUser, appId: string, folderId: string): Promise<ReportFolderResponse> {
    await this.assertAppExists(appId);
    const folder = await this.getFolderOrThrow(appId, folderId);
    this.accessPolicy.assertCanViewFolder(user, folder);

    const reports = folder.reports
      .filter((report) => this.accessPolicy.canAccessReport(user, folder, report))
      .map((report) => this.responseMapper.mapReportSummary(user, report, folder));

    return {
      canWrite: this.accessPolicy.canWriteReports(user),
      folder: this.responseMapper.mapFolderSummary(user, folder),
      reports
    };
  }

  async createFolder(user: SessionUser, appId: string, payload: unknown): Promise<ReportFolderResponse> {
    await this.assertAppExists(appId);
    const normalized = this.inputNormalizer.normalizeFolderInput(payload);

    const created = await this.prismaService.reportFolderRecord.create({
      data: {
        appId,
        label: normalized.label,
        description: normalized.description ?? null,
        ownerContactId: user.sub,
        accessMode: this.inputNormalizer.toFolderAccessMode(normalized.accessMode),
        shares: normalized.accessMode === 'shared'
          ? {
              createMany: {
                data: normalized.shares.map((share) => ({
                  subjectType: this.inputNormalizer.toShareSubjectType(share.subjectType),
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
      canWrite: this.accessPolicy.canWriteReports(user),
      folder: this.responseMapper.mapFolderSummary(user, created),
      reports: []
    };
  }

  async updateFolder(user: SessionUser, appId: string, folderId: string, payload: unknown): Promise<ReportFolderResponse> {
    await this.assertAppExists(appId);
    const existing = await this.getFolderOrThrow(appId, folderId);
    this.accessPolicy.assertCanManageFolder(user, existing);
    const normalized = this.inputNormalizer.normalizeFolderInput(payload);

    await this.prismaService.$transaction(async (tx) => {
      await tx.reportFolderRecord.update({
        where: { id: folderId },
        data: {
          label: normalized.label,
          description: normalized.description ?? null,
          accessMode: this.inputNormalizer.toFolderAccessMode(normalized.accessMode)
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
            subjectType: this.inputNormalizer.toShareSubjectType(share.subjectType),
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
    this.accessPolicy.assertCanManageFolder(user, existing);

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
    this.accessPolicy.assertCanManageFolder(user, folder);

    if (folder.accessMode !== ReportFolderAccessMode.SHARED) {
      throw new BadRequestException('Folder sharing can be updated only when accessMode is shared');
    }

    const shares = this.inputNormalizer.normalizeShareGrants(sharesPayload, 'shares');
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
          subjectType: this.inputNormalizer.toShareSubjectType(share.subjectType),
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
    const normalized = this.inputNormalizer.normalizeReportInput(payload);
    const folder = await this.getFolderOrThrow(appId, normalized.folderId);
    this.accessPolicy.assertCanManageFolder(user, folder);

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
        shareMode: this.inputNormalizer.toReportShareMode(normalized.shareMode),
        shares: normalized.shareMode === 'restricted'
          ? {
              createMany: {
                data: normalized.shares.map((share) => ({
                  subjectType: this.inputNormalizer.toShareSubjectType(share.subjectType),
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
    this.accessPolicy.assertCanViewReport(user, report.folder, report);

    return {
      canWrite: this.accessPolicy.canWriteReports(user),
      report: this.responseMapper.mapReportDefinition(user, report, report.folder)
    };
  }

  async updateReport(user: SessionUser, appId: string, reportId: string, payload: unknown): Promise<ReportResponse> {
    await this.assertAppExists(appId);
    const existing = await this.getReportOrThrow(appId, reportId);
    this.accessPolicy.assertCanManageReport(user, existing);
    const normalized = this.inputNormalizer.normalizeReportInput(payload, existing);
    const targetFolder = await this.getFolderOrThrow(appId, normalized.folderId);
    this.accessPolicy.assertCanManageFolder(user, targetFolder);

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
          shareMode: this.inputNormalizer.toReportShareMode(normalized.shareMode)
        }
      });

      await tx.reportDefinitionShareRecord.deleteMany({
        where: { reportId }
      });

      if (normalized.shareMode === 'restricted' && normalized.shares.length > 0) {
        await tx.reportDefinitionShareRecord.createMany({
          data: normalized.shares.map((share) => ({
            reportId,
            subjectType: this.inputNormalizer.toShareSubjectType(share.subjectType),
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
    this.accessPolicy.assertCanManageReport(user, existing);

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
    this.accessPolicy.assertCanManageReport(user, report);

    if (report.shareMode !== ReportShareMode.RESTRICTED) {
      throw new BadRequestException('Report shares can be updated only when shareMode is restricted');
    }

    const shares = this.inputNormalizer.normalizeShareGrants(sharesPayload, 'shares');
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
          subjectType: this.inputNormalizer.toShareSubjectType(share.subjectType),
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
    const reportRecord = await this.getReportOrThrow(appId, reportId);
    this.accessPolicy.assertCanViewReport(user, reportRecord.folder, reportRecord);
    const report = this.responseMapper.mapReportDefinition(user, reportRecord, reportRecord.folder);

    return this.reportRunner.runReport(user, appId, reportId, report, cursor);
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
    const maxItems = this.inputNormalizer.clamp(limit ?? 12, 1, 25);

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
    const maxItems = this.inputNormalizer.clamp(limit ?? 20, 1, 25);
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
    const maxItems = this.inputNormalizer.clamp(limit ?? 25, 1, 50);
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

}
