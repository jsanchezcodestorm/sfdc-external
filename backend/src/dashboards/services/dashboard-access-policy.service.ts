import { ForbiddenException, Injectable } from '@nestjs/common';
import { ReportFolderAccessMode, ReportShareMode, ReportShareSubjectType } from '@prisma/client';

import { AclService } from '../../acl/acl.service';
import { AuditWriteService } from '../../audit/audit-write.service';
import type { SessionUser } from '../../auth/session-user.interface';
import type {
  DashboardAccessDefinitionLike,
  DashboardAccessFolderLike,
  DashboardAccessSourceReportLike,
  DashboardFolderRecordWithRelations,
  DashboardRecordWithRelations,
  DashboardShareRecordLike,
  SourceReportRecord
} from '../dashboard-records.types';

@Injectable()
export class DashboardAccessPolicyService {
  constructor(
    private readonly aclService: AclService,
    private readonly auditWriteService: AuditWriteService
  ) {}

  canWriteDashboards(user: SessionUser): boolean {
    return this.aclService.canAccess(user.permissions, 'rest:dashboards-write');
  }

  canAccessDashboardFolder(user: SessionUser, folder: DashboardAccessFolderLike): boolean {
    if (this.isAdmin(user) || folder.ownerContactId === user.sub) {
      return true;
    }

    if (folder.accessMode === ReportFolderAccessMode.PERSONAL) {
      return false;
    }

    return this.hasMatchingShareGrant(user, folder.shares);
  }

  canAccessSourceReport(user: SessionUser, report: DashboardAccessSourceReportLike): boolean {
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

  canAccessDashboard(
    user: SessionUser,
    folder: DashboardAccessFolderLike,
    dashboard: DashboardAccessDefinitionLike
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

  canManageDashboardFolder(user: SessionUser, folder: DashboardAccessFolderLike, throwOnFailure: boolean): boolean {
    const allowed = this.isAdmin(user) || folder.ownerContactId === user.sub;
    if (!allowed && throwOnFailure) {
      throw new ForbiddenException('Only the owner or an admin can manage this folder');
    }

    return allowed;
  }

  canManageDashboard(
    user: SessionUser,
    dashboard: Pick<DashboardAccessDefinitionLike, 'ownerContactId'>,
    throwOnFailure: boolean
  ): boolean {
    const allowed = this.isAdmin(user) || dashboard.ownerContactId === user.sub;
    if (!allowed && throwOnFailure) {
      throw new ForbiddenException('Only the owner or an admin can manage this dashboard');
    }

    return allowed;
  }

  assertCanManageDashboardFolder(user: SessionUser, folder: DashboardAccessFolderLike): void {
    this.canManageDashboardFolder(user, folder, true);
  }

  assertCanManageDashboard(user: SessionUser, dashboard: DashboardRecordWithRelations): void {
    this.canManageDashboard(user, dashboard, true);
  }

  assertCanViewDashboardFolder(user: SessionUser, folder: DashboardFolderRecordWithRelations): void {
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

  assertCanViewDashboard(
    user: SessionUser,
    folder: DashboardRecordWithRelations['folder'],
    dashboard: DashboardRecordWithRelations
  ): void {
    if (this.canAccessDashboard(user, folder, dashboard)) {
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

  assertCanUseSourceReport(user: SessionUser, sourceReport: SourceReportRecord): void {
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

  private hasMatchingShareGrant(user: SessionUser, shares: DashboardShareRecordLike[]): boolean {
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
}
