-- CreateTable
CREATE TABLE "entity_configs" (
    "id" VARCHAR(64) NOT NULL,
    "objectApiName" VARCHAR(128) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "navigationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_list_configs" (
    "entityId" VARCHAR(64) NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "subtitle" VARCHAR(512),
    "primaryActionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_list_configs_pkey" PRIMARY KEY ("entityId")
);

-- CreateTable
CREATE TABLE "entity_list_view_configs" (
    "id" UUID NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "viewId" VARCHAR(64) NOT NULL,
    "label" VARCHAR(256) NOT NULL,
    "description" VARCHAR(512),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "pageSize" INTEGER,
    "queryJson" JSONB NOT NULL,
    "columnsJson" JSONB NOT NULL,
    "searchJson" JSONB,
    "primaryActionJson" JSONB,
    "rowActionsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_list_view_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_detail_configs" (
    "entityId" VARCHAR(64) NOT NULL,
    "queryJson" JSONB NOT NULL,
    "titleTemplate" VARCHAR(512),
    "fallbackTitle" VARCHAR(256),
    "subtitle" VARCHAR(512),
    "actionsJson" JSONB,
    "pathStatusJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_detail_configs_pkey" PRIMARY KEY ("entityId")
);

-- CreateTable
CREATE TABLE "entity_detail_section_configs" (
    "id" UUID NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "fieldsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_detail_section_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_related_list_configs" (
    "id" UUID NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
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

    CONSTRAINT "entity_related_list_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_form_configs" (
    "entityId" VARCHAR(64) NOT NULL,
    "createTitle" VARCHAR(256) NOT NULL,
    "editTitle" VARCHAR(256) NOT NULL,
    "queryJson" JSONB NOT NULL,
    "subtitle" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_form_configs_pkey" PRIMARY KEY ("entityId")
);

-- CreateTable
CREATE TABLE "entity_form_section_configs" (
    "id" UUID NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" VARCHAR(256),
    "fieldsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_form_section_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entity_list_view_configs_entityId_viewId_key" ON "entity_list_view_configs"("entityId", "viewId");

-- CreateIndex
CREATE INDEX "entity_list_view_configs_entityId_sortOrder_idx" ON "entity_list_view_configs"("entityId", "sortOrder");

-- CreateIndex
CREATE INDEX "entity_detail_section_configs_entityId_sortOrder_idx" ON "entity_detail_section_configs"("entityId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "entity_related_list_configs_entityId_relatedListId_key" ON "entity_related_list_configs"("entityId", "relatedListId");

-- CreateIndex
CREATE INDEX "entity_related_list_configs_entityId_sortOrder_idx" ON "entity_related_list_configs"("entityId", "sortOrder");

-- CreateIndex
CREATE INDEX "entity_form_section_configs_entityId_sortOrder_idx" ON "entity_form_section_configs"("entityId", "sortOrder");

-- AddForeignKey
ALTER TABLE "entity_list_configs" ADD CONSTRAINT "entity_list_configs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entity_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_list_view_configs" ADD CONSTRAINT "entity_list_view_configs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entity_list_configs"("entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_detail_configs" ADD CONSTRAINT "entity_detail_configs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entity_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_detail_section_configs" ADD CONSTRAINT "entity_detail_section_configs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entity_detail_configs"("entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_related_list_configs" ADD CONSTRAINT "entity_related_list_configs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entity_detail_configs"("entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_form_configs" ADD CONSTRAINT "entity_form_configs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entity_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_form_section_configs" ADD CONSTRAINT "entity_form_section_configs_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entity_form_configs"("entityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed existing account entity configuration (migrated from backend/config/entities/account)
INSERT INTO "entity_configs" ("id", "objectApiName", "label", "description", "navigationJson", "updatedAt")
VALUES (
    'account',
    'Account',
    'Accounts',
    'Salesforce Account entity',
    '{"basePath":"/s/account"}'::jsonb,
    CURRENT_TIMESTAMP
);

INSERT INTO "entity_list_configs" ("entityId", "title", "subtitle", "primaryActionJson", "updatedAt")
VALUES (
    'account',
    'Accounts List',
    'Account records',
    '{"type":"link","label":"New Account","target":"new"}'::jsonb,
    CURRENT_TIMESTAMP
);

INSERT INTO "entity_list_view_configs" (
    "id",
    "entityId",
    "sortOrder",
    "viewId",
    "label",
    "isDefault",
    "pageSize",
    "queryJson",
    "columnsJson",
    "searchJson",
    "rowActionsJson",
    "updatedAt"
)
VALUES (
    '6d2b1d0e-50f7-44de-a8b6-ec2f4176e2d1',
    'account',
    0,
    'all',
    'All Accounts',
    true,
    25,
    '{"object":"Account","fields":["Id","Name","Type","Industry","OwnerId","CreatedDate"],"orderBy":[{"field":"Name","direction":"ASC"}]}'::jsonb,
    '[{"field":"Name","label":"Name"},{"field":"Type","label":"Type"},{"field":"Industry","label":"Industry"},{"field":"OwnerId","label":"Owner"},{"field":"CreatedDate","label":"Created"}]'::jsonb,
    '{"fields":["Name","Industry","Type"],"minLength":2}'::jsonb,
    '[{"type":"edit","label":"Edit"},{"type":"delete","label":"Delete"}]'::jsonb,
    CURRENT_TIMESTAMP
);

INSERT INTO "entity_detail_configs" (
    "entityId",
    "queryJson",
    "titleTemplate",
    "fallbackTitle",
    "actionsJson",
    "updatedAt"
)
VALUES (
    'account',
    '{"object":"Account","fields":["Id","Name","Type","Industry","OwnerId","CreatedDate"],"where":[{"field":"Id","operator":"=","value":"{{id}}"}],"limit":1}'::jsonb,
    '{{Name || Id}}',
    'Account Detail',
    '[{"type":"edit","label":"Edit"},{"type":"delete","label":"Delete"}]'::jsonb,
    CURRENT_TIMESTAMP
);

INSERT INTO "entity_detail_section_configs" (
    "id",
    "entityId",
    "sortOrder",
    "title",
    "fieldsJson",
    "updatedAt"
)
VALUES (
    'd7f3799f-7d44-45fb-bf22-7de6fb778301',
    'account',
    0,
    'Account Overview',
    '[{"label":"Account Name","field":"Name","highlight":true},{"label":"Type","field":"Type"},{"label":"Industry","field":"Industry"},{"label":"Owner","field":"OwnerId"},{"label":"Created","field":"CreatedDate","format":"datetime"}]'::jsonb,
    CURRENT_TIMESTAMP
);

INSERT INTO "entity_form_configs" (
    "entityId",
    "createTitle",
    "editTitle",
    "queryJson",
    "subtitle",
    "updatedAt"
)
VALUES (
    'account',
    'New Account',
    'Edit Account',
    '{"object":"Account","fields":["Id","Name","Type","Industry","OwnerId"],"where":[{"field":"Id","operator":"=","value":"{{id}}"}],"limit":1}'::jsonb,
    'Manage account data',
    CURRENT_TIMESTAMP
);

INSERT INTO "entity_form_section_configs" (
    "id",
    "entityId",
    "sortOrder",
    "title",
    "fieldsJson",
    "updatedAt"
)
VALUES (
    'f4c18e9b-677a-4a6e-9bf3-26204fb3f9f4',
    'account',
    0,
    'Main Information',
    '[{"label":"Name","field":"Name","inputType":"text","required":true},{"label":"Type","field":"Type","inputType":"text"},{"label":"Industry","field":"Industry","inputType":"text"},{"label":"Owner Id","field":"OwnerId","inputType":"text"}]'::jsonb,
    CURRENT_TIMESTAMP
);
