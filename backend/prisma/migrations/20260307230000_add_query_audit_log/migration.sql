CREATE TABLE "query_audit_log" (
    "id" BIGSERIAL NOT NULL,
    "requestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "contactId" VARCHAR(18) NOT NULL,
    "queryKind" VARCHAR(64) NOT NULL,
    "targetId" VARCHAR(128) NOT NULL,
    "objectApiName" VARCHAR(128) NOT NULL,
    "recordId" VARCHAR(18),
    "status" "ApplicationAuditStatus" NOT NULL,
    "resolvedSoql" TEXT NOT NULL,
    "baseWhere" TEXT NOT NULL,
    "baseWhereHash" VARCHAR(128) NOT NULL,
    "finalWhere" TEXT NOT NULL,
    "finalWhereHash" VARCHAR(128) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "errorCode" VARCHAR(128),
    "metadataJson" JSONB,
    "resultJson" JSONB,

    CONSTRAINT "query_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "query_audit_log_createdAt_idx" ON "query_audit_log"("createdAt");
CREATE INDEX "query_audit_log_requestId_idx" ON "query_audit_log"("requestId");
CREATE INDEX "query_audit_log_contactId_createdAt_idx" ON "query_audit_log"("contactId", "createdAt");
CREATE INDEX "query_audit_log_queryKind_createdAt_idx" ON "query_audit_log"("queryKind", "createdAt");
CREATE INDEX "query_audit_log_status_createdAt_idx" ON "query_audit_log"("status", "createdAt");
CREATE INDEX "query_audit_log_targetId_createdAt_idx" ON "query_audit_log"("targetId", "createdAt");
CREATE INDEX "query_audit_log_objectApiName_createdAt_idx" ON "query_audit_log"("objectApiName", "createdAt");
CREATE INDEX "query_audit_log_recordId_createdAt_idx" ON "query_audit_log"("recordId", "createdAt");
