-- CreateTable
CREATE TABLE "entity_query_cursor_cache" (
    "tokenHash" VARCHAR(128) NOT NULL,
    "cursorKind" VARCHAR(32) NOT NULL,
    "contactId" VARCHAR(18) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "viewId" VARCHAR(64),
    "relatedListId" VARCHAR(64),
    "recordId" VARCHAR(18),
    "searchTerm" VARCHAR(512),
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

    CONSTRAINT "entity_query_cursor_cache_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "entity_query_cursor_cache_contactId_entityId_cursorKind_idx" ON "entity_query_cursor_cache"("contactId", "entityId", "cursorKind");

-- CreateIndex
CREATE INDEX "entity_query_cursor_cache_expiresAt_idx" ON "entity_query_cursor_cache"("expiresAt");
