import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportFolderAccessMode } from '@prisma/client';

import { AuditWriteService } from '../../audit/audit-write.service';
import type { SessionUser } from '../../auth/session-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardFolderResponse,
  DashboardsWorkspaceResponse
} from '../dashboards.types';
import { DashboardAccessPolicyService } from './dashboard-access-policy.service';
import { DashboardAppConfigService } from './dashboard-app-config.service';
import { DashboardDefinitionValidatorService } from './dashboard-definition-validator.service';
import { DashboardInputNormalizerService } from './dashboard-input-normalizer.service';
import { DashboardRecordsRepository } from './dashboard-records.repository';
import { DashboardResponseMapperService } from './dashboard-response-mapper.service';
import { DashboardShareCodecService } from './dashboard-share-codec.service';

@Injectable()
export class DashboardFoldersRuntimeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditWriteService: AuditWriteService,
    private readonly appConfigService: DashboardAppConfigService,
    private readonly dashboardRecordsRepository: DashboardRecordsRepository,
    private readonly responseMapper: DashboardResponseMapperService,
    private readonly accessPolicy: DashboardAccessPolicyService,
    private readonly inputNormalizer: DashboardInputNormalizerService,
    private readonly definitionValidator: DashboardDefinitionValidatorService,
    private readonly shareCodec: DashboardShareCodecService
  ) {}

  async getWorkspace(user: SessionUser, appId: string): Promise<DashboardsWorkspaceResponse> {
    await this.appConfigService.assertAppExists(appId);
    const folders = await this.dashboardRecordsRepository.listFoldersWithDashboards(appId);

    return {
      appId,
      canWrite: this.accessPolicy.canWriteDashboards(user),
      folders: folders
        .filter((folder) => this.accessPolicy.canAccessDashboardFolder(user, folder))
        .map((folder) => this.responseMapper.mapFolderSummary(user, folder))
    };
  }

  async getFolder(user: SessionUser, appId: string, folderId: string): Promise<DashboardFolderResponse> {
    await this.appConfigService.assertAppExists(appId);
    const folder = await this.dashboardRecordsRepository.getFolderOrThrow(appId, folderId);
    this.accessPolicy.assertCanViewDashboardFolder(user, folder);

    return {
      canWrite: this.accessPolicy.canWriteDashboards(user),
      folder: this.responseMapper.mapFolderSummary(user, folder),
      dashboards: folder.dashboards
        .filter((dashboard) => this.accessPolicy.canAccessDashboard(user, folder, dashboard))
        .map((dashboard) => this.responseMapper.mapDashboardSummary(user, dashboard))
    };
  }

  async createFolder(user: SessionUser, appId: string, payload: unknown): Promise<DashboardFolderResponse> {
    await this.appConfigService.assertAppExists(appId);
    const normalized = this.inputNormalizer.normalizeFolderInput(payload);

    const created = await this.prismaService.dashboardFolderRecord.create({
      data: {
        appId,
        label: normalized.label,
        description: normalized.description ?? null,
        ownerContactId: user.sub,
        accessMode: this.shareCodec.toFolderAccessMode(normalized.accessMode),
        shares: normalized.accessMode === 'shared'
          ? {
              createMany: {
                data: normalized.shares.map((share) => ({
                  subjectType: this.shareCodec.toShareSubjectType(share.subjectType),
                  subjectId: share.subjectId
                }))
              }
            }
          : undefined
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
    await this.appConfigService.assertAppExists(appId);
    const existing = await this.dashboardRecordsRepository.getFolderOrThrow(appId, folderId);
    this.accessPolicy.assertCanManageDashboardFolder(user, existing);
    const normalized = this.inputNormalizer.normalizeFolderInput(payload);

    this.definitionValidator.assertFolderScopeCompatibleWithDashboards(normalized, existing.dashboards);

    await this.prismaService.$transaction(async (tx) => {
      await tx.dashboardFolderRecord.update({
        where: { id: folderId },
        data: {
          label: normalized.label,
          description: normalized.description ?? null,
          accessMode: this.shareCodec.toFolderAccessMode(normalized.accessMode)
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
            subjectType: this.shareCodec.toShareSubjectType(share.subjectType),
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
    await this.appConfigService.assertAppExists(appId);
    const existing = await this.dashboardRecordsRepository.getFolderOrThrow(appId, folderId);
    this.accessPolicy.assertCanManageDashboardFolder(user, existing);

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

  async updateFolderShares(
    user: SessionUser,
    appId: string,
    folderId: string,
    sharesPayload: unknown[]
  ): Promise<DashboardFolderResponse> {
    await this.appConfigService.assertAppExists(appId);
    const folder = await this.dashboardRecordsRepository.getFolderOrThrow(appId, folderId);
    this.accessPolicy.assertCanManageDashboardFolder(user, folder);

    if (folder.accessMode !== ReportFolderAccessMode.SHARED) {
      throw new BadRequestException('Folder sharing can be updated only when accessMode is shared');
    }

    const shares = this.inputNormalizer.normalizeShareGrants(sharesPayload, 'shares');
    if (shares.length === 0) {
      throw new BadRequestException('Shared folder requires at least one share grant');
    }

    this.definitionValidator.assertFolderScopeCompatibleWithDashboards(
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
          subjectType: this.shareCodec.toShareSubjectType(share.subjectType),
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
}
