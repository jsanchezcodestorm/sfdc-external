import { Injectable } from '@nestjs/common';
import { ReportShareSubjectType } from '@prisma/client';

import type { SessionUser } from '../../auth/session-user.interface';
import type { FolderRecordWithRelations, ReportRecordWithRelations } from '../report-record.types';
import type {
  ReportDefinition,
  ReportFolderSummary,
  ReportShareGrant,
  ReportSummary
} from '../reports.types';
import { ReportAccessPolicyService } from './report-access-policy.service';
import { ReportInputNormalizerService } from './report-input-normalizer.service';
import { ReportJsonReaderService } from './report-json-reader.service';

@Injectable()
export class ReportResponseMapperService {
  constructor(
    private readonly accessPolicy: ReportAccessPolicyService,
    private readonly inputNormalizer: ReportInputNormalizerService,
    private readonly jsonReader: ReportJsonReaderService
  ) {}

  mapFolderSummary(user: SessionUser, folder: FolderRecordWithRelations): ReportFolderSummary {
    return {
      id: folder.id,
      appId: folder.appId,
      label: folder.label,
      description: folder.description ?? undefined,
      ownerContactId: folder.ownerContactId,
      accessMode: this.inputNormalizer.fromFolderAccessMode(folder.accessMode),
      shares: folder.shares.map((share) => this.mapShareGrant(share)),
      reportCount: folder.reports.filter((report) => this.accessPolicy.canAccessReport(user, folder, report)).length,
      canEdit: this.accessPolicy.canManageFolder(user, folder, false),
      canShare: this.accessPolicy.canManageFolder(user, folder, false),
      updatedAt: folder.updatedAt.toISOString()
    };
  }

  mapReportSummary(
    user: SessionUser,
    report: FolderRecordWithRelations['reports'][number],
    folder: FolderRecordWithRelations
  ): ReportSummary {
    const columns = this.jsonReader.readColumns(report.columnsJson, `report ${report.id}.columns`);
    const groupings = this.jsonReader.readGroupings(report.groupingsJson, `report ${report.id}.groupings`);

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
      shareMode: this.inputNormalizer.fromReportShareMode(report.shareMode),
      canEdit: this.accessPolicy.canManageReport(user, report, false),
      canShare: this.accessPolicy.canManageReport(user, report, false),
      updatedAt: report.updatedAt.toISOString()
    };
  }

  mapReportDefinition(user: SessionUser, report: ReportRecordWithRelations, folder: FolderRecordWithRelations): ReportDefinition {
    return {
      ...this.mapReportSummary(user, report, folder),
      filters: this.jsonReader.readFilters(report.filtersJson, `report ${report.id}.filters`),
      sort: this.jsonReader.readSort(report.sortJson, `report ${report.id}.sort`),
      pageSize: this.inputNormalizer.clamp(report.pageSize, 1, 2000),
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
}
