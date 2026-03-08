-- CreateEnum
CREATE TYPE "VisibilityPolicyDefinitionCacheStatus" AS ENUM ('READY', 'INVALID');

-- DropIndex
DROP INDEX "user_scope_cache_objectApiName_policyVersion_idx";

-- Purge derived cache rows before reshaping the table
DELETE FROM "user_scope_cache";

-- AlterTable
ALTER TABLE "user_scope_cache" DROP COLUMN "policyVersion",
ADD COLUMN     "appliedCones" JSONB NOT NULL,
ADD COLUMN     "appliedRules" JSONB NOT NULL,
ADD COLUMN     "compiledAllowPredicate" TEXT,
ADD COLUMN     "compiledDenyPredicate" TEXT,
ADD COLUMN     "deniedFields" JSONB,
ADD COLUMN     "matchedAssignments" JSONB NOT NULL,
ADD COLUMN     "objectPolicyVersion" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "objectPolicyVersion" BIGINT NOT NULL DEFAULT 1;

-- Drop the temporary default used to backfill existing rows
ALTER TABLE "audit_log" ALTER COLUMN "objectPolicyVersion" DROP DEFAULT;

-- CreateTable
CREATE TABLE "object_policy_version" (
    "objectApiName" VARCHAR(128) NOT NULL,
    "policyVersion" BIGINT NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "object_policy_version_pkey" PRIMARY KEY ("objectApiName")
);

-- CreateTable
CREATE TABLE "policy_definition_cache" (
    "objectApiName" VARCHAR(128) NOT NULL,
    "objectPolicyVersion" BIGINT NOT NULL,
    "status" "VisibilityPolicyDefinitionCacheStatus" NOT NULL,
    "compiledDefinition" JSONB,
    "invalidRuleId" UUID,
    "invalidRuleMessage" VARCHAR(512),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_definition_cache_pkey" PRIMARY KEY ("objectApiName","objectPolicyVersion")
);

-- CreateIndex
CREATE INDEX "user_scope_cache_objectApiName_objectPolicyVersion_idx" ON "user_scope_cache"("objectApiName", "objectPolicyVersion");
