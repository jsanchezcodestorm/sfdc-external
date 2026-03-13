ALTER TYPE "AppItemKind" ADD VALUE IF NOT EXISTS 'DASHBOARD';

CREATE TABLE "dashboard_folders" (
    "id" UUID NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "ownerContactId" VARCHAR(18) NOT NULL,
    "accessMode" "ReportFolderAccessMode" NOT NULL DEFAULT 'PERSONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dashboard_folder_shares" (
    "id" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "subjectType" "ReportShareSubjectType" NOT NULL,
    "subjectId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_folder_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dashboard_definitions" (
    "id" UUID NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "folderId" UUID NOT NULL,
    "sourceReportId" UUID NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "ownerContactId" VARCHAR(18) NOT NULL,
    "filtersJson" JSONB NOT NULL,
    "widgetsJson" JSONB NOT NULL,
    "layoutJson" JSONB NOT NULL,
    "shareMode" "ReportShareMode" NOT NULL DEFAULT 'INHERIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dashboard_definition_shares" (
    "id" UUID NOT NULL,
    "dashboardId" UUID NOT NULL,
    "subjectType" "ReportShareSubjectType" NOT NULL,
    "subjectId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_definition_shares_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboard_folders_appId_label_idx" ON "dashboard_folders"("appId", "label");
CREATE INDEX "dashboard_folders_appId_ownerContactId_idx" ON "dashboard_folders"("appId", "ownerContactId");

CREATE UNIQUE INDEX "dashboard_folder_shares_folderId_subjectType_subjectId_key"
ON "dashboard_folder_shares"("folderId", "subjectType", "subjectId");
CREATE INDEX "dashboard_folder_shares_folderId_idx" ON "dashboard_folder_shares"("folderId");
CREATE INDEX "dashboard_folder_shares_subjectType_subjectId_idx"
ON "dashboard_folder_shares"("subjectType", "subjectId");

CREATE INDEX "dashboard_definitions_appId_folderId_label_idx"
ON "dashboard_definitions"("appId", "folderId", "label");
CREATE INDEX "dashboard_definitions_appId_ownerContactId_idx"
ON "dashboard_definitions"("appId", "ownerContactId");
CREATE INDEX "dashboard_definitions_appId_sourceReportId_idx"
ON "dashboard_definitions"("appId", "sourceReportId");

CREATE UNIQUE INDEX "dashboard_definition_shares_dashboardId_subjectType_subjectId_key"
ON "dashboard_definition_shares"("dashboardId", "subjectType", "subjectId");
CREATE INDEX "dashboard_definition_shares_dashboardId_idx"
ON "dashboard_definition_shares"("dashboardId");
CREATE INDEX "dashboard_definition_shares_subjectType_subjectId_idx"
ON "dashboard_definition_shares"("subjectType", "subjectId");

ALTER TABLE "dashboard_folders"
    ADD CONSTRAINT "dashboard_folders_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "app_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_folder_shares"
    ADD CONSTRAINT "dashboard_folder_shares_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "dashboard_folders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_definitions"
    ADD CONSTRAINT "dashboard_definitions_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "app_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_definitions"
    ADD CONSTRAINT "dashboard_definitions_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "dashboard_folders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dashboard_definitions"
    ADD CONSTRAINT "dashboard_definitions_sourceReportId_fkey"
    FOREIGN KEY ("sourceReportId") REFERENCES "report_definitions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dashboard_definition_shares"
    ADD CONSTRAINT "dashboard_definition_shares_dashboardId_fkey"
    FOREIGN KEY ("dashboardId") REFERENCES "dashboard_definitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "acl_resources" ("id", "type", "target", "description", "updatedAt")
VALUES
    ('rest:dashboards-read', 'REST', '/dashboards/apps/:appId', 'Lettura workspace dashboard applicativo', CURRENT_TIMESTAMP),
    ('rest:dashboards-write', 'REST', '/dashboards/apps/:appId', 'Authoring workspace dashboard applicativo', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "acl_resource_permissions" ("id", "resourceId", "permissionCode", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('b4f69445-c67d-447a-9095-58487ed1a801', 'rest:dashboards-read', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('d608f92f-b264-4d77-a0b3-e61a86342fd1', 'rest:dashboards-write', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("resourceId", "permissionCode") DO NOTHING;
