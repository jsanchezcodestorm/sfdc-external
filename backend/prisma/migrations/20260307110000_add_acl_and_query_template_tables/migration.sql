-- CreateEnum
CREATE TYPE "AclResourceKind" AS ENUM ('REST', 'ENTITY', 'QUERY', 'ROUTE');

-- CreateTable
CREATE TABLE "acl_permissions" (
    "code" VARCHAR(80) NOT NULL,
    "label" VARCHAR(128),
    "description" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acl_permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "acl_permission_aliases" (
    "id" UUID NOT NULL,
    "permissionCode" VARCHAR(80) NOT NULL,
    "alias" VARCHAR(80) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acl_permission_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acl_default_permissions" (
    "permissionCode" VARCHAR(80) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acl_default_permissions_pkey" PRIMARY KEY ("permissionCode")
);

-- CreateTable
CREATE TABLE "acl_resources" (
    "id" VARCHAR(128) NOT NULL,
    "type" "AclResourceKind" NOT NULL,
    "target" VARCHAR(512),
    "description" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acl_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acl_resource_permissions" (
    "id" UUID NOT NULL,
    "resourceId" VARCHAR(128) NOT NULL,
    "permissionCode" VARCHAR(80) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acl_resource_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_templates" (
    "id" VARCHAR(64) NOT NULL,
    "objectApiName" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "soql" TEXT NOT NULL,
    "defaultParamsJson" JSONB,
    "maxLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "query_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acl_permission_aliases_alias_key" ON "acl_permission_aliases"("alias");

-- CreateIndex
CREATE INDEX "acl_permission_aliases_permissionCode_sortOrder_idx" ON "acl_permission_aliases"("permissionCode", "sortOrder");

-- CreateIndex
CREATE INDEX "acl_default_permissions_sortOrder_idx" ON "acl_default_permissions"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "acl_resource_permissions_resourceId_permissionCode_key" ON "acl_resource_permissions"("resourceId", "permissionCode");

-- CreateIndex
CREATE INDEX "acl_resource_permissions_resourceId_sortOrder_idx" ON "acl_resource_permissions"("resourceId", "sortOrder");

-- CreateIndex
CREATE INDEX "acl_resource_permissions_permissionCode_idx" ON "acl_resource_permissions"("permissionCode");

-- AddForeignKey
ALTER TABLE "acl_permission_aliases" ADD CONSTRAINT "acl_permission_aliases_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "acl_permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acl_default_permissions" ADD CONSTRAINT "acl_default_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "acl_permissions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acl_resource_permissions" ADD CONSTRAINT "acl_resource_permissions_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "acl_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acl_resource_permissions" ADD CONSTRAINT "acl_resource_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "acl_permissions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed ACL permissions
INSERT INTO "acl_permissions" ("code", "label", "description", "updatedAt")
VALUES
    ('PORTAL_USER', 'Portal User', 'Accesso base utente', CURRENT_TIMESTAMP),
    ('PORTAL_OPERATIONS', 'Portal Operations', 'Accesso funzionalita operations', CURRENT_TIMESTAMP),
    ('PORTAL_HR', 'Portal HR', 'Accesso funzionalita HR', CURRENT_TIMESTAMP),
    ('PORTAL_ADMIN', 'Portal Admin', 'Accesso amministrativo completo', CURRENT_TIMESTAMP);

INSERT INTO "acl_permission_aliases" ("id", "permissionCode", "alias", "sortOrder", "updatedAt")
VALUES
    ('d0bcbd43-c7ed-4f90-8d60-6482aebc7ff1', 'PORTAL_USER', 'USER', 0, CURRENT_TIMESTAMP),
    ('e6b76cb0-21c9-4892-9c84-c3f7b355f879', 'PORTAL_OPERATIONS', 'OPS', 0, CURRENT_TIMESTAMP),
    ('586d56ca-ad8d-41ff-9b75-b2d5b4b30f69', 'PORTAL_HR', 'HR', 0, CURRENT_TIMESTAMP),
    ('0c5f35c3-940d-4f50-8157-739f07544459', 'PORTAL_ADMIN', 'ADMIN', 0, CURRENT_TIMESTAMP),
    ('3d2f87c0-b8a5-4568-87e8-6f0901cff522', 'PORTAL_ADMIN', 'SUPERUSER', 1, CURRENT_TIMESTAMP);

INSERT INTO "acl_default_permissions" ("permissionCode", "sortOrder", "updatedAt")
VALUES ('PORTAL_USER', 0, CURRENT_TIMESTAMP);

-- Seed ACL resources
INSERT INTO "acl_resources" ("id", "type", "target", "description", "updatedAt")
VALUES
    ('rest:navigation-read', 'REST', '/navigation', 'Legge la navigazione disponibile', CURRENT_TIMESTAMP),
    ('rest:global-search', 'REST', '/global-search', 'Ricerca globale applicativa', CURRENT_TIMESTAMP),
    ('rest:entities-read', 'REST', '/entities/:entityId', 'Lettura metadata e dati entity', CURRENT_TIMESTAMP),
    ('rest:entities-write', 'REST', '/entities/:entityId/records', 'Operazioni write entity (create/update/delete)', CURRENT_TIMESTAMP),
    ('rest:entities-config-admin', 'REST', '/entities/admin/configs', 'Gestione amministrativa entity config su PostgreSQL', CURRENT_TIMESTAMP),
    ('rest:query-execute', 'REST', '/query/template/:templateId', 'Esecuzione query template', CURRENT_TIMESTAMP),
    ('rest:salesforce-objects', 'REST', '/salesforce/objects', 'Describe metadata Salesforce', CURRENT_TIMESTAMP),
    ('rest:salesforce-raw-query', 'REST', '/salesforce/query', 'Query SOQL raw read-only', CURRENT_TIMESTAMP),
    ('rest:visibility-debug', 'REST', '/visibility/evaluate', 'Diagnostica visibilita', CURRENT_TIMESTAMP),
    ('rest:acl-config-admin', 'REST', '/acl/admin/config', 'Gestione amministrativa configurazione ACL', CURRENT_TIMESTAMP),
    ('rest:query-template-admin', 'REST', '/query/admin/templates', 'Gestione amministrativa query template', CURRENT_TIMESTAMP),
    ('entity:account', 'ENTITY', '/entities/account', 'Accesso entity account', CURRENT_TIMESTAMP),
    ('entity:opportunity', 'ENTITY', '/entities/opportunity', 'Accesso entity opportunity', CURRENT_TIMESTAMP),
    ('query:account-pipeline', 'QUERY', '/query/template/account-pipeline', 'Pipeline account', CURRENT_TIMESTAMP),
    ('route:home', 'ROUTE', '/', 'Dashboard home', CURRENT_TIMESTAMP),
    ('route:operations-pipeline', 'ROUTE', '/operations/pipeline', 'Pagina pipeline operations', CURRENT_TIMESTAMP),
    ('route:admin-visibility', 'ROUTE', '/admin/visibility', 'Pagina admin visibility', CURRENT_TIMESTAMP),
    ('route:admin-entity-config', 'ROUTE', '/admin/entity-config', 'Pagina admin configurazione entita PostgreSQL', CURRENT_TIMESTAMP),
    ('route:admin-acl', 'ROUTE', '/admin/acl', 'Pagina admin configurazione ACL', CURRENT_TIMESTAMP),
    ('route:admin-query-templates', 'ROUTE', '/admin/query-templates', 'Pagina admin query template', CURRENT_TIMESTAMP);

INSERT INTO "acl_resource_permissions" ("id", "resourceId", "permissionCode", "sortOrder", "updatedAt")
VALUES
    ('510d400c-2f41-4c27-8273-b227422a1303', 'rest:navigation-read', 'PORTAL_USER', 0, CURRENT_TIMESTAMP),
    ('6ae9dcec-8a12-4158-9b4f-f25dfe6b13d0', 'rest:navigation-read', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('82cf45a0-48c6-4dfc-a1ac-4d4be1a4d4ad', 'rest:global-search', 'PORTAL_USER', 0, CURRENT_TIMESTAMP),
    ('889806ef-2215-4d1a-bc6f-0a0af718d205', 'rest:global-search', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('32bca8cc-5e1d-42dd-abaa-190c2733f9db', 'rest:entities-read', 'PORTAL_USER', 0, CURRENT_TIMESTAMP),
    ('ec94f6ba-b242-4f93-a3db-63f4b2e8565c', 'rest:entities-read', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('30a7f6c6-4c9f-4821-ac65-f25b3f26de82', 'rest:entities-write', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('dd5f40d7-c6fd-44ae-9328-155fd8f2f1c2', 'rest:entities-config-admin', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('8e3a9f5b-c98e-49e3-a6ec-76905ef3c1a5', 'rest:query-execute', 'PORTAL_USER', 0, CURRENT_TIMESTAMP),
    ('9d48d54d-d220-41db-89af-b483fd8fbcde', 'rest:query-execute', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('e269e0cb-35b8-42bd-a491-e55574d70956', 'rest:salesforce-objects', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('6e0f33e9-30d0-4ec5-a315-fae17de72fb4', 'rest:salesforce-raw-query', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('0e62a18b-83cc-42aa-9b78-60d839479c1b', 'rest:visibility-debug', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('017c6af0-0bad-4a0a-b152-7b129a50324d', 'rest:acl-config-admin', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('6d3dc6a5-7a56-48e7-b19e-0d77e2a91d7f', 'rest:query-template-admin', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('9a1fd09f-e5b0-4c8b-b402-e5774cf1c9b8', 'entity:account', 'PORTAL_USER', 0, CURRENT_TIMESTAMP),
    ('5d0d16f4-9258-429f-a95b-bb3fd6c52e43', 'entity:account', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('a9c09c43-8d55-45d1-89e8-86e8c8c6b1aa', 'entity:opportunity', 'PORTAL_OPERATIONS', 0, CURRENT_TIMESTAMP),
    ('96d6525c-ff2d-40c3-a62f-82fdab633ff2', 'entity:opportunity', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('bf880d0c-716f-4a37-a731-f8da4317c865', 'query:account-pipeline', 'PORTAL_OPERATIONS', 0, CURRENT_TIMESTAMP),
    ('dbfbe88f-a03a-449b-882d-8b355ebf177e', 'query:account-pipeline', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('425b3b64-5279-4169-a86c-3632211cb6df', 'route:home', 'PORTAL_USER', 0, CURRENT_TIMESTAMP),
    ('779d0e3a-a938-47a8-a3cc-d6b8bc5f2f2a', 'route:home', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('1c401086-5ae6-410b-afc4-c4f3bb899851', 'route:operations-pipeline', 'PORTAL_OPERATIONS', 0, CURRENT_TIMESTAMP),
    ('00eb86f1-e4dc-44f7-8449-ee062d4f1f56', 'route:operations-pipeline', 'PORTAL_ADMIN', 1, CURRENT_TIMESTAMP),
    ('c2e40e2a-53ed-49b8-9ed1-64d0c0b3b5ce', 'route:admin-visibility', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('339b8c3e-aa3a-443d-8913-811e12a130a8', 'route:admin-entity-config', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('535144d7-fd57-45d6-a2c8-0ba4b9f1d287', 'route:admin-acl', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('2ff6d27a-a8ed-4944-9ed8-f2c5ef6d95de', 'route:admin-query-templates', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP);

-- Seed query templates
INSERT INTO "query_templates" ("id", "objectApiName", "description", "soql", "defaultParamsJson", "maxLimit", "updatedAt")
VALUES (
    'account-pipeline',
    'Account',
    'Account list per industry',
    'SELECT Id, Name, Industry, OwnerId FROM Account WHERE Industry = {{industry}} LIMIT {{limit}}',
    '{"industry":"Technology","limit":50}'::jsonb,
    200,
    CURRENT_TIMESTAMP
);
