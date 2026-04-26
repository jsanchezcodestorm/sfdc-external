import { ForbiddenException, Injectable } from '@nestjs/common';
import { ReportFolderAccessMode, ReportShareMode, ReportShareSubjectType } from '@prisma/client';

import { AclService } from '../../acl/acl.service';
import { AuditWriteService } from '../../audit/audit-write.service';
import type { SessionUser } from '../../auth/session-user.interface';
import type { FolderRecordWithRelations, ReportRecordWithRelations } from '../report-record.types';

@Injectable()
export class ReportAccessPolicyService {
  constructor(
    private readonly aclService: AclService,
    private readonly auditWriteService: AuditWriteService
  ) {}

  canWriteReports(user: SessionUser): boolean {
    return this.aclService.canAccess(user.permissions, 'rest:reports-write');
  }

  canAccessFolder(user: SessionUser, folder: FolderRecordWithRelations): boolean {
    if (this.isAdmin(user) || folder.ownerContactId === user.sub) {
      return true;
    }

    if (folder.accessMode === ReportFolderAccessMode.PERSONAL) {
      return false;
    }

    return this.hasMatchingShareGrant(user, folder.shares);
  }

  canAccessReport(
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

  canManageFolder(user: SessionUser, folder: FolderRecordWithRelations, throwOnFailure: boolean): boolean {
    const allowed = this.isAdmin(user) || folder.ownerContactId === user.sub;
    if (!allowed && throwOnFailure) {
      throw new ForbiddenException('Only the owner or an admin can manage this folder');
    }

    return allowed;
  }

  canManageReport(
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

  assertCanManageFolder(user: SessionUser, folder: FolderRecordWithRelations): void {
    this.canManageFolder(user, folder, true);
  }

  assertCanManageReport(user: SessionUser, report: ReportRecordWithRelations): void {
    this.canManageReport(user, report, true);
  }

  assertCanViewFolder(user: SessionUser, folder: FolderRecordWithRelations): void {
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

  assertCanViewReport(user: SessionUser, folder: FolderRecordWithRelations, report: ReportRecordWithRelations): void {
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
}
