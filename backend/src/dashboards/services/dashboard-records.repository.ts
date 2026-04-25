import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardFolderRecordWithRelations,
  DashboardRecordWithRelations,
  SourceReportRecord
} from '../dashboard-records.types';

@Injectable()
export class DashboardRecordsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  listFoldersWithDashboards(appId: string): Promise<DashboardFolderRecordWithRelations[]> {
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

  async getFolderOrThrow(appId: string, folderId: string): Promise<DashboardFolderRecordWithRelations> {
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

  async getDashboardOrThrow(appId: string, dashboardId: string): Promise<DashboardRecordWithRelations> {
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

  async getSourceReportOrThrow(appId: string, reportId: string): Promise<SourceReportRecord> {
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
}
