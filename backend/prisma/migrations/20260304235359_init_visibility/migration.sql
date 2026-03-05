-- CreateEnum
CREATE TYPE "VisibilityRuleEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "VisibilityDecision" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "policy_meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "policyVersion" BIGINT NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cones" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL,
    "coneId" UUID NOT NULL,
    "objectApiName" VARCHAR(128) NOT NULL,
    "effect" "VisibilityRuleEffect" NOT NULL,
    "conditionJson" JSONB NOT NULL,
    "fieldsAllowed" JSONB,
    "fieldsDenied" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "coneId" UUID NOT NULL,
    "contactId" VARCHAR(18),
    "permissionCode" VARCHAR(80),
    "recordType" VARCHAR(80),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_scope_cache" (
    "cacheKey" VARCHAR(255) NOT NULL,
    "objectApiName" VARCHAR(128) NOT NULL,
    "policyVersion" BIGINT NOT NULL,
    "compiledPredicate" TEXT NOT NULL,
    "compiledFields" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_scope_cache_pkey" PRIMARY KEY ("cacheKey")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "requestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" VARCHAR(18) NOT NULL,
    "permissionsHash" VARCHAR(128) NOT NULL,
    "recordType" VARCHAR(80),
    "objectApiName" VARCHAR(128) NOT NULL,
    "queryKind" VARCHAR(64) NOT NULL,
    "baseWhereHash" VARCHAR(128) NOT NULL,
    "finalWhereHash" VARCHAR(128) NOT NULL,
    "appliedCones" JSONB NOT NULL,
    "appliedRules" JSONB NOT NULL,
    "decision" "VisibilityDecision" NOT NULL,
    "decisionReasonCode" VARCHAR(64) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "policyVersion" BIGINT NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cones_code_key" ON "cones"("code");

-- CreateIndex
CREATE INDEX "rules_objectApiName_active_idx" ON "rules"("objectApiName", "active");

-- CreateIndex
CREATE INDEX "assignments_contactId_permissionCode_recordType_validFrom_v_idx" ON "assignments"("contactId", "permissionCode", "recordType", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "user_scope_cache_objectApiName_policyVersion_idx" ON "user_scope_cache"("objectApiName", "policyVersion");

-- CreateIndex
CREATE INDEX "user_scope_cache_expiresAt_idx" ON "user_scope_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_contactId_createdAt_idx" ON "audit_log"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_objectApiName_createdAt_idx" ON "audit_log"("objectApiName", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_decisionReasonCode_createdAt_idx" ON "audit_log"("decisionReasonCode", "createdAt");

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_coneId_fkey" FOREIGN KEY ("coneId") REFERENCES "cones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_coneId_fkey" FOREIGN KEY ("coneId") REFERENCES "cones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
