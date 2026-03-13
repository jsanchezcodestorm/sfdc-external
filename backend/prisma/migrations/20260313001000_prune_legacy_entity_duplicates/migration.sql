WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
UPDATE "entity_related_list_configs" AS "relatedList"
SET "linkedEntityId" = "mapping"."normalizedId"
FROM "mapping"
WHERE "relatedList"."linkedEntityId" = "mapping"."legacyId";

WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
UPDATE "entity_query_cursor_cache" AS "cursorCache"
SET "entityId" = "mapping"."normalizedId"
FROM "mapping"
WHERE "cursorCache"."entityId" = "mapping"."legacyId";

WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
UPDATE "app_item_records" AS "item"
SET "entityId" = "mapping"."normalizedId"
FROM "mapping"
WHERE "item"."entityId" = "mapping"."legacyId";

WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
UPDATE "app_item_records" AS "item"
SET "resourceId" = "mapping"."normalizedResourceId"
FROM "mapping"
WHERE "item"."resourceId" = "mapping"."legacyResourceId";

WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
UPDATE "acl_resources" AS "resource"
SET "sourceRef" = "mapping"."normalizedId"
FROM "mapping"
WHERE "resource"."sourceType" = 'ENTITY'
  AND "resource"."sourceRef" = "mapping"."legacyId";

WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
INSERT INTO "acl_resources" (
  "id",
  "type",
  "accessMode",
  "managedBy",
  "syncState",
  "sourceType",
  "sourceRef",
  "target",
  "description",
  "createdAt",
  "updatedAt"
)
SELECT
  "mapping"."normalizedResourceId",
  "resource"."type",
  "resource"."accessMode",
  "resource"."managedBy",
  "resource"."syncState",
  "resource"."sourceType",
  "mapping"."normalizedId",
  "resource"."target",
  "resource"."description",
  "resource"."createdAt",
  "resource"."updatedAt"
FROM "acl_resources" AS "resource"
JOIN "mapping"
  ON "resource"."id" = "mapping"."legacyResourceId"
LEFT JOIN "acl_resources" AS "normalized"
  ON "normalized"."id" = "mapping"."normalizedResourceId"
WHERE "normalized"."id" IS NULL;

WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
INSERT INTO "acl_resource_permissions" (
  "id",
  "resourceId",
  "permissionCode",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "mapping"."normalizedResourceId",
  "legacyPermission"."permissionCode",
  "legacyPermission"."sortOrder",
  "legacyPermission"."createdAt",
  "legacyPermission"."updatedAt"
FROM "acl_resource_permissions" AS "legacyPermission"
JOIN "mapping"
  ON "legacyPermission"."resourceId" = "mapping"."legacyResourceId"
LEFT JOIN "acl_resource_permissions" AS "normalizedPermission"
  ON "normalizedPermission"."resourceId" = "mapping"."normalizedResourceId"
  AND "normalizedPermission"."permissionCode" = "legacyPermission"."permissionCode"
WHERE "normalizedPermission"."id" IS NULL;

WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
DELETE FROM "acl_resources" AS "resource"
USING "mapping"
WHERE "resource"."id" = "mapping"."legacyResourceId";

WITH "mapping" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId") AS (
  VALUES
    ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
    ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
    ('Product2', 'product2', 'entity:Product2', 'entity:product2')
)
DELETE FROM "entity_configs" AS "entityConfig"
USING "mapping"
WHERE "entityConfig"."id" = "mapping"."legacyId"
  AND EXISTS (
    SELECT 1
    FROM "entity_configs" AS "normalizedEntity"
    WHERE "normalizedEntity"."id" = "mapping"."normalizedId"
  );
