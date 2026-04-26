import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../../auth/session-user.interface';
import { ResourceAccessService } from '../../common/services/resource-access.service';
import type {
  ReportDefinition,
  ReportRunResponse
} from '../reports.types';
import { ReportCursorExecutorService } from './report-cursor-executor.service';
import { ReportQueryCursorService } from './report-query-cursor.service';
import { ReportRunResultMapperService } from './report-run-result-mapper.service';
import { ReportSoqlBuilderService } from './report-soql-builder.service';

@Injectable()
export class ReportRunnerService {
  constructor(
    private readonly resourceAccessService: ResourceAccessService,
    private readonly reportQueryCursorService: ReportQueryCursorService,
    private readonly reportSoqlBuilderService: ReportSoqlBuilderService,
    private readonly cursorExecutor: ReportCursorExecutorService,
    private readonly resultMapper: ReportRunResultMapperService
  ) {}

  async runReport(
    user: SessionUser,
    appId: string,
    reportId: string,
    report: ReportDefinition,
    cursor: string | undefined
  ): Promise<ReportRunResponse> {
    await this.reportQueryCursorService.deleteExpiredCursors();
    const visibility = await this.resourceAccessService.authorizeObjectAccess(
      user,
      'rest:reports-read',
      report.objectApiName,
      {
        queryKind: 'REPORT_RUN'
      }
    );

    const compiled = this.reportSoqlBuilderService.buildReportQueries(report, visibility);
    const paginationResult = await this.cursorExecutor.execute({
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

    return {
      report,
      columns: compiled.visibleColumns.map((column) => ({
        field: column.field,
        label: column.label?.trim() || column.field
      })),
      rows: this.resultMapper.mapRunRows(paginationResult.records, compiled.visibleColumns),
      groups: await this.resultMapper.mapGroups(
        paginationResult.records,
        compiled.visibleGroupings,
        compiled.countSoql
      ),
      total: paginationResult.totalSize,
      pageSize: report.pageSize,
      nextCursor: paginationResult.nextCursor,
      visibility
    };
  }
}
