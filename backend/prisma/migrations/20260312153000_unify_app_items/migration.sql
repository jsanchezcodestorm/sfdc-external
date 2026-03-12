CREATE TYPE "AppItemKind" AS ENUM ('HOME', 'ENTITY', 'CUSTOM_PAGE', 'EXTERNAL_LINK', 'REPORT');

CREATE TABLE "app_item_records" (
    "appId" VARCHAR(64) NOT NULL,
    "itemId" VARCHAR(64) NOT NULL,
    "kind" "AppItemKind" NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "sortOrder" INTEGER NOT NULL,
    "entityId" VARCHAR(64),
    "resourceId" VARCHAR(128),
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_item_records_pkey" PRIMARY KEY ("appId", "itemId")
);

CREATE UNIQUE INDEX "app_item_records_appId_sortOrder_key" ON "app_item_records"("appId", "sortOrder");
CREATE INDEX "app_item_records_appId_kind_sortOrder_idx" ON "app_item_records"("appId", "kind", "sortOrder");
CREATE INDEX "app_item_records_entityId_idx" ON "app_item_records"("entityId");
CREATE INDEX "app_item_records_resourceId_idx" ON "app_item_records"("resourceId");

ALTER TABLE "app_item_records"
    ADD CONSTRAINT "app_item_records_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "app_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_item_records"
    ADD CONSTRAINT "app_item_records_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "entity_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "app_item_records" ("appId", "itemId", "kind", "label", "description", "sortOrder", "configJson", "updatedAt")
SELECT
    "id" AS "appId",
    'home' AS "itemId",
    'HOME'::"AppItemKind" AS "kind",
    'Home' AS "label",
    NULL AS "description",
    0 AS "sortOrder",
    '{"blocks":[]}'::jsonb AS "configJson",
    CURRENT_TIMESTAMP AS "updatedAt"
FROM "app_configs";

INSERT INTO "app_item_records" ("appId", "itemId", "kind", "label", "description", "sortOrder", "entityId", "updatedAt")
SELECT
    assignment."appId",
    assignment."entityId" AS "itemId",
    'ENTITY'::"AppItemKind" AS "kind",
    entity."label",
    entity."description",
    assignment."sortOrder" + 1 AS "sortOrder",
    assignment."entityId",
    assignment."updatedAt"
FROM "app_entity_assignments" assignment
INNER JOIN "entity_configs" entity
    ON entity."id" = assignment."entityId";

DROP TABLE "app_entity_assignments";
