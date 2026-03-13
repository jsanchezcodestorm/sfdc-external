DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "entity_configs" WHERE "id" = 'Contact')
    AND EXISTS (SELECT 1 FROM "entity_configs" WHERE "id" = 'contact') THEN
    RAISE EXCEPTION 'Cannot normalize legacy entity id Contact because contact already exists';
  END IF;

  IF EXISTS (SELECT 1 FROM "entity_configs" WHERE "id" = 'Opportunity')
    AND EXISTS (SELECT 1 FROM "entity_configs" WHERE "id" = 'opportunity') THEN
    RAISE EXCEPTION 'Cannot normalize legacy entity id Opportunity because opportunity already exists';
  END IF;

  IF EXISTS (SELECT 1 FROM "entity_configs" WHERE "id" = 'Product2')
    AND EXISTS (SELECT 1 FROM "entity_configs" WHERE "id" = 'product2') THEN
    RAISE EXCEPTION 'Cannot normalize legacy entity id Product2 because product2 already exists';
  END IF;
END $$;

CREATE TEMP TABLE "_legacy_entity_id_map" (
  "legacyId" VARCHAR(64) PRIMARY KEY,
  "normalizedId" VARCHAR(64) NOT NULL,
  "legacyResourceId" VARCHAR(128) NOT NULL,
  "normalizedResourceId" VARCHAR(128) NOT NULL
) ON COMMIT DROP;

INSERT INTO "_legacy_entity_id_map" ("legacyId", "normalizedId", "legacyResourceId", "normalizedResourceId")
VALUES
  ('Contact', 'contact', 'entity:Contact', 'entity:contact'),
  ('Opportunity', 'opportunity', 'entity:Opportunity', 'entity:opportunity'),
  ('Product2', 'product2', 'entity:Product2', 'entity:product2');

UPDATE "entity_related_list_configs" AS "relatedList"
SET "linkedEntityId" = "mapping"."normalizedId"
FROM "_legacy_entity_id_map" AS "mapping"
WHERE "relatedList"."linkedEntityId" = "mapping"."legacyId";

UPDATE "entity_query_cursor_cache" AS "cursorCache"
SET "entityId" = "mapping"."normalizedId"
FROM "_legacy_entity_id_map" AS "mapping"
WHERE "cursorCache"."entityId" = "mapping"."legacyId";

UPDATE "app_item_records" AS "item"
SET "resourceId" = "mapping"."normalizedResourceId"
FROM "_legacy_entity_id_map" AS "mapping"
WHERE "item"."resourceId" = "mapping"."legacyResourceId";

UPDATE "acl_resources" AS "resource"
SET "sourceRef" = "mapping"."normalizedId"
FROM "_legacy_entity_id_map" AS "mapping"
WHERE "resource"."sourceType" = 'ENTITY'
  AND "resource"."sourceRef" = "mapping"."legacyId";

DELETE FROM "acl_resources" AS "resource"
USING "_legacy_entity_id_map" AS "mapping"
WHERE "resource"."id" = "mapping"."legacyResourceId"
  AND EXISTS (
    SELECT 1
    FROM "acl_resources" AS "targetResource"
    WHERE "targetResource"."id" = "mapping"."normalizedResourceId"
  );

UPDATE "acl_resources" AS "resource"
SET "id" = "mapping"."normalizedResourceId"
FROM "_legacy_entity_id_map" AS "mapping"
WHERE "resource"."id" = "mapping"."legacyResourceId";

UPDATE "entity_configs" AS "entityConfig"
SET "id" = "mapping"."normalizedId"
FROM "_legacy_entity_id_map" AS "mapping"
WHERE "entityConfig"."id" = "mapping"."legacyId";
