import type { Prisma } from '@prisma/client';

export type FolderRecordWithRelations = Prisma.ReportFolderRecordGetPayload<{
  include: {
    shares: true;
    reports: {
      include: {
        shares: true;
      };
      orderBy: {
        updatedAt: 'desc';
      };
    };
  };
}>;

export type ReportRecordWithRelations = Prisma.ReportDefinitionRecordGetPayload<{
  include: {
    shares: true;
    folder: {
      include: {
        shares: true;
        reports: {
          include: {
            shares: true;
          };
          orderBy: {
            updatedAt: 'desc';
          };
        };
      };
    };
  };
}>;
