import type { Prisma, ReportFolderAccessMode, ReportShareMode, ReportShareSubjectType } from '@prisma/client';

export type SourceReportRecord = Prisma.ReportDefinitionRecordGetPayload<{
  include: {
    shares: true;
    folder: {
      include: {
        shares: true;
      };
    };
  };
}>;

export type DashboardFolderRecordWithRelations = Prisma.DashboardFolderRecordGetPayload<{
  include: {
    shares: true;
    dashboards: {
      include: {
        shares: true;
        sourceReport: {
          include: {
            shares: true;
            folder: {
              include: {
                shares: true;
              };
            };
          };
        };
      };
      orderBy: {
        updatedAt: 'desc';
      };
    };
  };
}>;

export type DashboardRecordWithRelations = Prisma.DashboardDefinitionRecordGetPayload<{
  include: {
    shares: true;
    folder: {
      include: {
        shares: true;
        dashboards: {
          include: {
            shares: true;
          };
          orderBy: {
            updatedAt: 'desc';
          };
        };
      };
    };
    sourceReport: {
      include: {
        shares: true;
        folder: {
          include: {
            shares: true;
          };
        };
      };
    };
  };
}>;

export interface DashboardGrantEnvelope {
  ownerOnly: boolean;
  allowedGrantKeys: Set<string>;
}

export interface DashboardFieldMetadata {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

export interface DashboardShareRecordLike {
  subjectType: ReportShareSubjectType;
  subjectId: string;
}

export interface DashboardAccessFolderLike {
  id?: string;
  appId?: string;
  ownerContactId: string;
  accessMode: ReportFolderAccessMode;
  shares: DashboardShareRecordLike[];
}

export interface DashboardAccessSourceReportLike {
  id?: string;
  appId?: string;
  ownerContactId: string;
  shareMode: ReportShareMode;
  shares: DashboardShareRecordLike[];
  folder: Pick<DashboardAccessFolderLike, 'accessMode' | 'shares'>;
}

export interface DashboardAccessDefinitionLike {
  id?: string;
  appId?: string;
  folderId?: string;
  sourceReportId?: string;
  ownerContactId: string;
  shareMode: ReportShareMode;
  shares: DashboardShareRecordLike[];
  sourceReport: DashboardAccessSourceReportLike;
}
