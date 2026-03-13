-- CreateEnum
CREATE TYPE "ReportFolderAccessMode" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "ReportShareMode" AS ENUM ('INHERIT', 'RESTRICTED', 'PERSONAL');

-- CreateEnum
CREATE TYPE "ReportShareSubjectType" AS ENUM ('CONTACT', 'PERMISSION');

-- CreateTable
CREATE TABLE "report_query_cursor_cache" (
    "tokenHash" VARCHAR(128) NOT NULL,
    "contactId" VARCHAR(18) NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "reportId" UUID NOT NULL,
    "objectApiName" VARCHAR(128) NOT NULL,
    "pageSize" INTEGER NOT NULL,
    "totalSize" INTEGER NOT NULL,
    "resolvedSoql" TEXT NOT NULL,
    "baseWhere" TEXT NOT NULL,
    "finalWhere" TEXT NOT NULL,
    "queryFingerprint" VARCHAR(128) NOT NULL,
    "sourceLocator" TEXT,
    "sourceRecordsJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_query_cursor_cache_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "report_folders" (
    "id" UUID NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "ownerContactId" VARCHAR(18) NOT NULL,
    "accessMode" "ReportFolderAccessMode" NOT NULL DEFAULT 'PERSONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_folder_shares" (
    "id" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "subjectType" "ReportShareSubjectType" NOT NULL,
    "subjectId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_folder_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_definitions" (
    "id" UUID NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "folderId" UUID NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "ownerContactId" VARCHAR(18) NOT NULL,
    "objectApiName" VARCHAR(128) NOT NULL,
    "columnsJson" JSONB NOT NULL,
    "filtersJson" JSONB NOT NULL,
    "groupingsJson" JSONB NOT NULL,
    "sortJson" JSONB NOT NULL,
    "pageSize" INTEGER NOT NULL DEFAULT 50,
    "shareMode" "ReportShareMode" NOT NULL DEFAULT 'INHERIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_definition_shares" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "subjectType" "ReportShareSubjectType" NOT NULL,
    "subjectId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_definition_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_query_cursor_cache_contactId_appId_reportId_idx" ON "report_query_cursor_cache"("contactId", "appId", "reportId");

-- CreateIndex
CREATE INDEX "report_query_cursor_cache_expiresAt_idx" ON "report_query_cursor_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "report_folders_appId_label_idx" ON "report_folders"("appId", "label");

-- CreateIndex
CREATE INDEX "report_folders_appId_ownerContactId_idx" ON "report_folders"("appId", "ownerContactId");

-- CreateIndex
CREATE UNIQUE INDEX "report_folder_shares_folderId_subjectType_subjectId_key" ON "report_folder_shares"("folderId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "report_folder_shares_folderId_idx" ON "report_folder_shares"("folderId");

-- CreateIndex
CREATE INDEX "report_folder_shares_subjectType_subjectId_idx" ON "report_folder_shares"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "report_definitions_appId_folderId_label_idx" ON "report_definitions"("appId", "folderId", "label");

-- CreateIndex
CREATE INDEX "report_definitions_appId_ownerContactId_idx" ON "report_definitions"("appId", "ownerContactId");

-- CreateIndex
CREATE UNIQUE INDEX "report_definition_shares_reportId_subjectType_subjectId_key" ON "report_definition_shares"("reportId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "report_definition_shares_reportId_idx" ON "report_definition_shares"("reportId");

-- CreateIndex
CREATE INDEX "report_definition_shares_subjectType_subjectId_idx" ON "report_definition_shares"("subjectType", "subjectId");

-- AddForeignKey
ALTER TABLE "report_folders"
    ADD CONSTRAINT "report_folders_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "app_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_folder_shares"
    ADD CONSTRAINT "report_folder_shares_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "report_folders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definitions"
    ADD CONSTRAINT "report_definitions_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "app_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definitions"
    ADD CONSTRAINT "report_definitions_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "report_folders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definition_shares"
    ADD CONSTRAINT "report_definition_shares_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "report_definitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "acl_resources" ("id", "type", "target", "description", "updatedAt")
VALUES
    ('rest:reports-read', 'REST', '/reports/apps/:appId', 'Lettura workspace report applicativo', CURRENT_TIMESTAMP),
    ('rest:reports-write', 'REST', '/reports/apps/:appId', 'Authoring workspace report applicativo', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET
    "type" = EXCLUDED."type",
    "target" = EXCLUDED."target",
    "description" = EXCLUDED."description",
    "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "acl_resource_permissions" ("id", "resourceId", "permissionCode", "sortOrder", "updatedAt")
VALUES
    ('0d934b45-a70b-4ce0-b7ec-8ad24d816537', 'rest:reports-read', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('13dc87fe-2a0d-4179-95a4-6ce06fc3b13c', 'rest:reports-write', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("resourceId", "permissionCode") DO UPDATE
SET
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = EXCLUDED."updatedAt";
