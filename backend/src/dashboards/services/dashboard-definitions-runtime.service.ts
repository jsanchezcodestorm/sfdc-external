import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportShareMode, type Prisma } from '@prisma/client';

import { AuditWriteService } from '../../audit/audit-write.service';
import type { SessionUser } from '../../auth/session-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardResponse } from '../dashboards.types';
import { DashboardAccessPolicyService } from './dashboard-access-policy.service';
import { DashboardAppConfigService } from './dashboard-app-config.service';
import { DashboardDefinitionReaderService } from './dashboard-definition-reader.service';
import { DashboardDefinitionValidatorService } from './dashboard-definition-validator.service';
import { DashboardInputNormalizerService } from './dashboard-input-normalizer.service';
import { DashboardRecordsRepository } from './dashboard-records.repository';
import { DashboardResponseMapperService } from './dashboard-response-mapper.service';
import { DashboardShareCodecService } from './dashboard-share-codec.service';

@Injectable()
export class DashboardDefinitionsRuntimeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditWriteService: AuditWriteService,
    private readonly appConfigService: DashboardAppConfigService,
    private readonly dashboardRecordsRepository: DashboardRecordsRepository,
    private readonly responseMapper: DashboardResponseMapperService,
    private readonly accessPolicy: DashboardAccessPolicyService,
    private readonly inputNormalizer: DashboardInputNormalizerService,
    private readonly definitionReader: DashboardDefinitionReaderService,
    private readonly definitionValidator: DashboardDefinitionValidatorService,
    private readonly shareCodec: DashboardShareCodecService
  ) {}

  async getDashboard(user: SessionUser, appId: string, dashboardId: string): Promise<DashboardResponse> {
    await this.appConfigService.assertAppExists(appId);
    const dashboard = await this.dashboardRecordsRepository.getDashboardOrThrow(appId, dashboardId);
    this.accessPolicy.assertCanViewDashboard(user, dashboard.folder, dashboard);

    return {
      canWrite: this.accessPolicy.canWriteDashboards(user),
      dashboard: this.responseMapper.mapDashboardDefinition(user, dashboard)
    };
  }

  async createDashboard(user: SessionUser, appId: string, payload: unknown): Promise<DashboardResponse> {
    await this.appConfigService.assertAppExists(appId);
    const normalized = this.inputNormalizer.normalizeDashboardInput(payload);
    const folder = await this.dashboardRecordsRepository.getFolderOrThrow(appId, normalized.folderId);
    this.accessPolicy.assertCanManageDashboardFolder(user, folder);
    const sourceReport = await this.dashboardRecordsRepository.getSourceReportOrThrow(appId, normalized.sourceReportId);
    this.accessPolicy.assertCanUseSourceReport(user, sourceReport);
    await this.definitionValidator.validateDashboardDefinition(user, sourceReport, normalized, normalized.folderId);

    const created = await this.prismaService.dashboardDefinitionRecord.create({
      data: {
        appId,
        folderId: normalized.folderId,
        sourceReportId: normalized.sourceReportId,
        label: normalized.label,
        description: normalized.description ?? null,
        ownerContactId: user.sub,
        filtersJson: normalized.filters as unknown as Prisma.InputJsonValue,
        widgetsJson: this.definitionReader.toWidgetsJson(normalized.widgets),
        layoutJson: this.definitionReader.toLayoutJson(normalized.widgets),
        shareMode: this.shareCodec.toShareMode(normalized.shareMode),
        shares: normalized.shareMode === 'restricted'
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
    await this.appConfigService.assertAppExists(appId);
    const existing = await this.dashboardRecordsRepository.getDashboardOrThrow(appId, dashboardId);
    this.accessPolicy.assertCanManageDashboard(user, existing);
    const normalized = this.inputNormalizer.normalizeDashboardInput(payload, existing);
    const folder = await this.dashboardRecordsRepository.getFolderOrThrow(appId, normalized.folderId);
    this.accessPolicy.assertCanManageDashboardFolder(user, folder);
    const sourceReport = await this.dashboardRecordsRepository.getSourceReportOrThrow(appId, normalized.sourceReportId);
    this.accessPolicy.assertCanUseSourceReport(user, sourceReport);
    await this.definitionValidator.validateDashboardDefinition(user, sourceReport, normalized, normalized.folderId);

    await this.prismaService.$transaction(async (tx) => {
      await tx.dashboardDefinitionRecord.update({
        where: { id: dashboardId },
        data: {
          folderId: normalized.folderId,
          label: normalized.label,
          description: normalized.description ?? null,
          filtersJson: normalized.filters as unknown as Prisma.InputJsonValue,
          widgetsJson: this.definitionReader.toWidgetsJson(normalized.widgets),
          layoutJson: this.definitionReader.toLayoutJson(normalized.widgets),
          shareMode: this.shareCodec.toShareMode(normalized.shareMode)
        }
      });

      await tx.dashboardDefinitionShareRecord.deleteMany({
        where: { dashboardId }
      });

      if (normalized.shareMode === 'restricted' && normalized.shares.length > 0) {
        await tx.dashboardDefinitionShareRecord.createMany({
          data: normalized.shares.map((share) => ({
            dashboardId,
            subjectType: this.shareCodec.toShareSubjectType(share.subjectType),
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
    await this.appConfigService.assertAppExists(appId);
    const existing = await this.dashboardRecordsRepository.getDashboardOrThrow(appId, dashboardId);
    this.accessPolicy.assertCanManageDashboard(user, existing);
    await this.appConfigService.assertDashboardNotReferencedByHome(existing.appId, dashboardId);

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
    await this.appConfigService.assertAppExists(appId);
    const dashboard = await this.dashboardRecordsRepository.getDashboardOrThrow(appId, dashboardId);
    this.accessPolicy.assertCanManageDashboard(user, dashboard);

    if (dashboard.shareMode !== ReportShareMode.RESTRICTED) {
      throw new BadRequestException('Dashboard shares can be updated only when shareMode is restricted');
    }

    const shares = this.inputNormalizer.normalizeShareGrants(sharesPayload, 'shares');
    if (shares.length === 0) {
      throw new BadRequestException('Restricted dashboard requires at least one share grant');
    }

    this.definitionValidator.assertDashboardSharesCompatibleWithSourceReport(
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
          subjectType: this.shareCodec.toShareSubjectType(share.subjectType),
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
}
