-- CreateTable
CREATE TABLE "salesforce_sobject_describe_cache" (
    "cacheKey" VARCHAR(64) NOT NULL,
    "cacheScope" VARCHAR(512) NOT NULL,
    "objectApiName" VARCHAR(128) NOT NULL,
    "apiVersion" VARCHAR(32) NOT NULL,
    "describeJson" JSONB NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salesforce_sobject_describe_cache_pkey" PRIMARY KEY ("cacheKey")
);

-- CreateIndex
CREATE INDEX "salesforce_sobject_describe_cache_cacheScope_objectApiName_ap_idx" ON "salesforce_sobject_describe_cache"("cacheScope", "objectApiName", "apiVersion");

-- CreateIndex
CREATE INDEX "salesforce_sobject_describe_cache_expiresAt_idx" ON "salesforce_sobject_describe_cache"("expiresAt");
