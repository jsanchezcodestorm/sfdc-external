ALTER TABLE "dashboard_folders"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "dashboard_folder_shares"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "dashboard_definitions"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "dashboard_definition_shares"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER INDEX "dashboard_definition_shares_dashboardId_subjectType_subjectId_key"
  RENAME TO "dashboard_definition_shares_dashboardId_subjectType_subject_key";
