import { Injectable } from '@nestjs/common';

import type { SessionUser } from '../auth/session-user.interface';

import type {
  DashboardFieldSuggestionResponse,
  DashboardFolderResponse,
  DashboardResponse,
  DashboardRunResponse,
  DashboardSourceReportSuggestionResponse,
  DashboardsWorkspaceResponse
} from './dashboards.types';
import { DashboardDefinitionsRuntimeService } from './services/dashboard-definitions-runtime.service';
import { DashboardFoldersRuntimeService } from './services/dashboard-folders-runtime.service';
import { DashboardRunnerService } from './services/dashboard-runner.service';
import { DashboardSuggestionsService } from './services/dashboard-suggestions.service';
import { DashboardAccessPolicyService } from './services/dashboard-access-policy.service';
import { DashboardAppConfigService } from './services/dashboard-app-config.service';
import { DashboardRecordsRepository } from './services/dashboard-records.repository';
import { DashboardResponseMapperService } from './services/dashboard-response-mapper.service';

@Injectable()
export class DashboardsRuntimeService {
  constructor(
    private readonly foldersRuntime: DashboardFoldersRuntimeService,
    private readonly definitionsRuntime: DashboardDefinitionsRuntimeService,
    private readonly runner: DashboardRunnerService,
    private readonly suggestions: DashboardSuggestionsService,
    private readonly appConfigService: DashboardAppConfigService,
    private readonly dashboardRecordsRepository: DashboardRecordsRepository,
    private readonly accessPolicy: DashboardAccessPolicyService,
    private readonly responseMapper: DashboardResponseMapperService
  ) {}

  getWorkspace(user: SessionUser, appId: string): Promise<DashboardsWorkspaceResponse> {
    return this.foldersRuntime.getWorkspace(user, appId);
  }

  getFolder(user: SessionUser, appId: string, folderId: string): Promise<DashboardFolderResponse> {
    return this.foldersRuntime.getFolder(user, appId, folderId);
  }

  createFolder(user: SessionUser, appId: string, payload: unknown): Promise<DashboardFolderResponse> {
    return this.foldersRuntime.createFolder(user, appId, payload);
  }

  updateFolder(user: SessionUser, appId: string, folderId: string, payload: unknown): Promise<DashboardFolderResponse> {
    return this.foldersRuntime.updateFolder(user, appId, folderId, payload);
  }

  deleteFolder(user: SessionUser, appId: string, folderId: string): Promise<void> {
    return this.foldersRuntime.deleteFolder(user, appId, folderId);
  }

  updateFolderShares(
    user: SessionUser,
    appId: string,
    folderId: string,
    sharesPayload: unknown[]
  ): Promise<DashboardFolderResponse> {
    return this.foldersRuntime.updateFolderShares(user, appId, folderId, sharesPayload);
  }

  getDashboard(user: SessionUser, appId: string, dashboardId: string): Promise<DashboardResponse> {
    return this.definitionsRuntime.getDashboard(user, appId, dashboardId);
  }

  createDashboard(user: SessionUser, appId: string, payload: unknown): Promise<DashboardResponse> {
    return this.definitionsRuntime.createDashboard(user, appId, payload);
  }

  updateDashboard(user: SessionUser, appId: string, dashboardId: string, payload: unknown): Promise<DashboardResponse> {
    return this.definitionsRuntime.updateDashboard(user, appId, dashboardId, payload);
  }

  deleteDashboard(user: SessionUser, appId: string, dashboardId: string): Promise<void> {
    return this.definitionsRuntime.deleteDashboard(user, appId, dashboardId);
  }

  updateDashboardShares(
    user: SessionUser,
    appId: string,
    dashboardId: string,
    sharesPayload: unknown[]
  ): Promise<DashboardResponse> {
    return this.definitionsRuntime.updateDashboardShares(user, appId, dashboardId, sharesPayload);
  }

  async runDashboard(
    user: SessionUser,
    appId: string,
    dashboardId: string,
    payload: { filters?: unknown[] } | undefined
  ): Promise<DashboardRunResponse> {
    await this.appConfigService.assertAppExists(appId);
    const dashboardRecord = await this.dashboardRecordsRepository.getDashboardOrThrow(appId, dashboardId);
    this.accessPolicy.assertCanViewDashboard(user, dashboardRecord.folder, dashboardRecord);
    const dashboard = this.responseMapper.mapDashboardDefinition(user, dashboardRecord);

    return this.runner.runDashboard(user, appId, dashboardRecord, dashboard, payload);
  }

  searchContacts(user: SessionUser, appId: string, query: string, limit: number | undefined) {
    return this.suggestions.searchContacts(user, appId, query, limit);
  }

  searchPermissions(user: SessionUser, appId: string, query: string, limit: number | undefined) {
    return this.suggestions.searchPermissions(user, appId, query, limit);
  }

  searchSourceReports(
    user: SessionUser,
    appId: string,
    query: string,
    limit: number | undefined
  ): Promise<DashboardSourceReportSuggestionResponse> {
    return this.suggestions.searchSourceReports(user, appId, query, limit);
  }

  searchSourceReportFields(
    user: SessionUser,
    appId: string,
    reportId: string,
    query: string | undefined,
    limit: number | undefined
  ): Promise<DashboardFieldSuggestionResponse> {
    return this.suggestions.searchSourceReportFields(user, appId, reportId, query, limit);
  }
}
