-- CreateEnum
CREATE TYPE "ApplicationAuditStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "security_audit_log" (
    "id" BIGSERIAL NOT NULL,
    "requestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" VARCHAR(18),
    "endpoint" VARCHAR(512) NOT NULL,
    "httpMethod" VARCHAR(16) NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "decision" "VisibilityDecision" NOT NULL,
    "reasonCode" VARCHAR(64) NOT NULL,
    "ipHash" VARCHAR(128) NOT NULL,
    "userAgentHash" VARCHAR(128) NOT NULL,
    "metadataJson" JSONB,

    CONSTRAINT "security_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_audit_log" (
    "id" BIGSERIAL NOT NULL,
    "requestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "contactId" VARCHAR(18) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "targetType" VARCHAR(64) NOT NULL,
    "targetId" VARCHAR(128) NOT NULL,
    "objectApiName" VARCHAR(128),
    "recordId" VARCHAR(18),
    "status" "ApplicationAuditStatus" NOT NULL,
    "payloadHash" VARCHAR(128) NOT NULL,
    "metadataJson" JSONB,
    "resultJson" JSONB,
    "errorCode" VARCHAR(128),

    CONSTRAINT "application_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_audit_log_createdAt_idx" ON "security_audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "security_audit_log_requestId_idx" ON "security_audit_log"("requestId");

-- CreateIndex
CREATE INDEX "security_audit_log_contactId_createdAt_idx" ON "security_audit_log"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "security_audit_log_eventType_createdAt_idx" ON "security_audit_log"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "security_audit_log_reasonCode_createdAt_idx" ON "security_audit_log"("reasonCode", "createdAt");

-- CreateIndex
CREATE INDEX "application_audit_log_createdAt_idx" ON "application_audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "application_audit_log_requestId_idx" ON "application_audit_log"("requestId");

-- CreateIndex
CREATE INDEX "application_audit_log_contactId_createdAt_idx" ON "application_audit_log"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "application_audit_log_action_createdAt_idx" ON "application_audit_log"("action", "createdAt");

-- CreateIndex
CREATE INDEX "application_audit_log_status_createdAt_idx" ON "application_audit_log"("status", "createdAt");

-- CreateIndex
CREATE INDEX "application_audit_log_targetType_createdAt_idx" ON "application_audit_log"("targetType", "createdAt");

-- CreateIndex
CREATE INDEX "application_audit_log_objectApiName_createdAt_idx" ON "application_audit_log"("objectApiName", "createdAt");

-- RenameIndex
ALTER INDEX "salesforce_sobject_describe_cache_cacheScope_objectApiName_ap_i" RENAME TO "salesforce_sobject_describe_cache_cacheScope_objectApiName__idx";
