CREATE TABLE "entity_layout_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entityId" VARCHAR(64) NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "layoutId" VARCHAR(64) NOT NULL,
  "label" VARCHAR(256) NOT NULL,
  "description" VARCHAR(512),
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entity_layout_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_layout_configs_entityId_layoutId_key" UNIQUE ("entityId", "layoutId"),
  CONSTRAINT "entity_layout_configs_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "entity_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "entity_layout_configs_entityId_sortOrder_idx"
  ON "entity_layout_configs"("entityId", "sortOrder");

CREATE TABLE "entity_layout_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "layoutConfigId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "recordTypeDeveloperName" VARCHAR(128),
  "permissionCode" VARCHAR(80),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entity_layout_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_layout_assignments_layoutConfigId_fkey"
    FOREIGN KEY ("layoutConfigId") REFERENCES "entity_layout_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "entity_layout_assignments_layoutConfigId_sortOrder_idx"
  ON "entity_layout_assignments"("layoutConfigId", "sortOrder");

CREATE INDEX "entity_layout_assignments_recordTypeDeveloperName_permissionCode_idx"
  ON "entity_layout_assignments"("recordTypeDeveloperName", "permissionCode");

INSERT INTO "entity_layout_configs" (
  "id",
  "entityId",
  "sortOrder",
  "layoutId",
  "label",
  "description",
  "isDefault",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "e"."id",
  0,
  'default',
  'Default',
  'Migrated legacy layout',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "entity_configs" AS "e"
WHERE EXISTS (
    SELECT 1
    FROM "entity_detail_configs" AS "d"
    WHERE "d"."entityId" = "e"."id"
  )
  OR EXISTS (
    SELECT 1
    FROM "entity_form_configs" AS "f"
    WHERE "f"."entityId" = "e"."id"
  );

CREATE TABLE "entity_detail_configs_next" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "layoutConfigId" UUID NOT NULL,
  "queryJson" JSONB NOT NULL,
  "titleTemplate" VARCHAR(512),
  "fallbackTitle" VARCHAR(256),
  "subtitle" VARCHAR(512),
  "actionsJson" JSONB,
  "pathStatusJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entity_detail_configs_next_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_detail_configs_next_layoutConfigId_key" UNIQUE ("layoutConfigId"),
  CONSTRAINT "entity_detail_configs_next_layoutConfigId_fkey"
    FOREIGN KEY ("layoutConfigId") REFERENCES "entity_layout_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "entity_detail_configs_next" (
  "id",
  "layoutConfigId",
  "queryJson",
  "titleTemplate",
  "fallbackTitle",
  "subtitle",
  "actionsJson",
  "pathStatusJson",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "layout"."id",
  "detail"."queryJson",
  "detail"."titleTemplate",
  "detail"."fallbackTitle",
  "detail"."subtitle",
  "detail"."actionsJson",
  "detail"."pathStatusJson",
  "detail"."createdAt",
  "detail"."updatedAt"
FROM "entity_detail_configs" AS "detail"
INNER JOIN "entity_layout_configs" AS "layout"
  ON "layout"."entityId" = "detail"."entityId"
 AND "layout"."layoutId" = 'default';

CREATE TABLE "entity_detail_section_configs_next" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "detailConfigId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "title" VARCHAR(256) NOT NULL,
  "fieldsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entity_detail_section_configs_next_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_detail_section_configs_next_detailConfigId_fkey"
    FOREIGN KEY ("detailConfigId") REFERENCES "entity_detail_configs_next"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "entity_detail_section_configs_next_detailConfigId_sortOrder_idx"
  ON "entity_detail_section_configs_next"("detailConfigId", "sortOrder");

INSERT INTO "entity_detail_section_configs_next" (
  "id",
  "detailConfigId",
  "sortOrder",
  "title",
  "fieldsJson",
  "createdAt",
  "updatedAt"
)
SELECT
  "section"."id",
  "detail_next"."id",
  "section"."sortOrder",
  "section"."title",
  "section"."fieldsJson",
  "section"."createdAt",
  "section"."updatedAt"
FROM "entity_detail_section_configs" AS "section"
INNER JOIN "entity_detail_configs" AS "detail_legacy"
  ON "detail_legacy"."entityId" = "section"."entityId"
INNER JOIN "entity_layout_configs" AS "layout"
  ON "layout"."entityId" = "detail_legacy"."entityId"
 AND "layout"."layoutId" = 'default'
INNER JOIN "entity_detail_configs_next" AS "detail_next"
  ON "detail_next"."layoutConfigId" = "layout"."id";

CREATE TABLE "entity_related_list_configs_next" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "detailConfigId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "relatedListId" VARCHAR(64) NOT NULL,
  "label" VARCHAR(256) NOT NULL,
  "description" VARCHAR(512),
  "queryJson" JSONB NOT NULL,
  "columnsJson" JSONB NOT NULL,
  "actionsJson" JSONB,
  "rowActionsJson" JSONB,
  "emptyState" VARCHAR(512),
  "pageSize" INTEGER,
  "linkedEntityId" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entity_related_list_configs_next_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_related_list_configs_next_detailConfigId_relatedListId_key" UNIQUE ("detailConfigId", "relatedListId"),
  CONSTRAINT "entity_related_list_configs_next_detailConfigId_fkey"
    FOREIGN KEY ("detailConfigId") REFERENCES "entity_detail_configs_next"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "entity_related_list_configs_next_detailConfigId_sortOrder_idx"
  ON "entity_related_list_configs_next"("detailConfigId", "sortOrder");

INSERT INTO "entity_related_list_configs_next" (
  "id",
  "detailConfigId",
  "sortOrder",
  "relatedListId",
  "label",
  "description",
  "queryJson",
  "columnsJson",
  "actionsJson",
  "rowActionsJson",
  "emptyState",
  "pageSize",
  "linkedEntityId",
  "createdAt",
  "updatedAt"
)
SELECT
  "related"."id",
  "detail_next"."id",
  "related"."sortOrder",
  "related"."relatedListId",
  "related"."label",
  "related"."description",
  "related"."queryJson",
  "related"."columnsJson",
  "related"."actionsJson",
  "related"."rowActionsJson",
  "related"."emptyState",
  "related"."pageSize",
  "related"."linkedEntityId",
  "related"."createdAt",
  "related"."updatedAt"
FROM "entity_related_list_configs" AS "related"
INNER JOIN "entity_detail_configs" AS "detail_legacy"
  ON "detail_legacy"."entityId" = "related"."entityId"
INNER JOIN "entity_layout_configs" AS "layout"
  ON "layout"."entityId" = "detail_legacy"."entityId"
 AND "layout"."layoutId" = 'default'
INNER JOIN "entity_detail_configs_next" AS "detail_next"
  ON "detail_next"."layoutConfigId" = "layout"."id";

CREATE TABLE "entity_form_configs_next" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "layoutConfigId" UUID NOT NULL,
  "createTitle" VARCHAR(256) NOT NULL,
  "editTitle" VARCHAR(256) NOT NULL,
  "queryJson" JSONB NOT NULL,
  "subtitle" VARCHAR(512),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entity_form_configs_next_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_form_configs_next_layoutConfigId_key" UNIQUE ("layoutConfigId"),
  CONSTRAINT "entity_form_configs_next_layoutConfigId_fkey"
    FOREIGN KEY ("layoutConfigId") REFERENCES "entity_layout_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "entity_form_configs_next" (
  "id",
  "layoutConfigId",
  "createTitle",
  "editTitle",
  "queryJson",
  "subtitle",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "layout"."id",
  "form"."createTitle",
  "form"."editTitle",
  "form"."queryJson",
  "form"."subtitle",
  "form"."createdAt",
  "form"."updatedAt"
FROM "entity_form_configs" AS "form"
INNER JOIN "entity_layout_configs" AS "layout"
  ON "layout"."entityId" = "form"."entityId"
 AND "layout"."layoutId" = 'default';

CREATE TABLE "entity_form_section_configs_next" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "formConfigId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "title" VARCHAR(256),
  "fieldsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entity_form_section_configs_next_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_form_section_configs_next_formConfigId_fkey"
    FOREIGN KEY ("formConfigId") REFERENCES "entity_form_configs_next"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "entity_form_section_configs_next_formConfigId_sortOrder_idx"
  ON "entity_form_section_configs_next"("formConfigId", "sortOrder");

INSERT INTO "entity_form_section_configs_next" (
  "id",
  "formConfigId",
  "sortOrder",
  "title",
  "fieldsJson",
  "createdAt",
  "updatedAt"
)
SELECT
  "section"."id",
  "form_next"."id",
  "section"."sortOrder",
  "section"."title",
  "section"."fieldsJson",
  "section"."createdAt",
  "section"."updatedAt"
FROM "entity_form_section_configs" AS "section"
INNER JOIN "entity_form_configs" AS "form_legacy"
  ON "form_legacy"."entityId" = "section"."entityId"
INNER JOIN "entity_layout_configs" AS "layout"
  ON "layout"."entityId" = "form_legacy"."entityId"
 AND "layout"."layoutId" = 'default'
INNER JOIN "entity_form_configs_next" AS "form_next"
  ON "form_next"."layoutConfigId" = "layout"."id";

DROP TABLE "entity_related_list_configs";
DROP TABLE "entity_detail_section_configs";
DROP TABLE "entity_detail_configs";
DROP TABLE "entity_form_section_configs";
DROP TABLE "entity_form_configs";

ALTER TABLE "entity_detail_configs_next" RENAME TO "entity_detail_configs";
ALTER TABLE "entity_detail_section_configs_next" RENAME TO "entity_detail_section_configs";
ALTER TABLE "entity_related_list_configs_next" RENAME TO "entity_related_list_configs";
ALTER TABLE "entity_form_configs_next" RENAME TO "entity_form_configs";
ALTER TABLE "entity_form_section_configs_next" RENAME TO "entity_form_section_configs";
