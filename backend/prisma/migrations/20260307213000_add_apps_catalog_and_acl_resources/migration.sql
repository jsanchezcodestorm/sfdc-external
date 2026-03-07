CREATE TABLE "app_configs" (
    "id" VARCHAR(64) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_entity_assignments" (
    "appId" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_entity_assignments_pkey" PRIMARY KEY ("appId", "entityId")
);

CREATE TABLE "app_permission_assignments" (
    "appId" VARCHAR(64) NOT NULL,
    "permissionCode" VARCHAR(80) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_permission_assignments_pkey" PRIMARY KEY ("appId", "permissionCode")
);

CREATE INDEX "app_configs_sortOrder_label_idx" ON "app_configs"("sortOrder", "label");
CREATE INDEX "app_entity_assignments_appId_sortOrder_idx" ON "app_entity_assignments"("appId", "sortOrder");
CREATE INDEX "app_entity_assignments_entityId_idx" ON "app_entity_assignments"("entityId");
CREATE INDEX "app_permission_assignments_appId_sortOrder_idx" ON "app_permission_assignments"("appId", "sortOrder");
CREATE INDEX "app_permission_assignments_permissionCode_idx" ON "app_permission_assignments"("permissionCode");

ALTER TABLE "app_entity_assignments"
    ADD CONSTRAINT "app_entity_assignments_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "app_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_entity_assignments"
    ADD CONSTRAINT "app_entity_assignments_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "entity_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_permission_assignments"
    ADD CONSTRAINT "app_permission_assignments_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "app_configs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "acl_resources" ("id", "type", "target", "description", "updatedAt")
VALUES
    ('rest:apps-read', 'REST', '/apps/available', 'Legge il catalogo app disponibile per l''utente', CURRENT_TIMESTAMP),
    ('rest:apps-admin', 'REST', '/apps/admin', 'Gestione amministrativa catalogo app', CURRENT_TIMESTAMP),
    ('route:admin-apps', 'ROUTE', '/admin/apps', 'Pagina admin catalogo app', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET
    "type" = EXCLUDED."type",
    "target" = EXCLUDED."target",
    "description" = EXCLUDED."description",
    "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "acl_resource_permissions" ("id", "resourceId", "permissionCode", "sortOrder", "updatedAt")
VALUES
    ('d09cb1d8-5a2e-4c8a-80b0-f9be2f2a08a1', 'rest:apps-read', 'PORTAL_USER', 0, CURRENT_TIMESTAMP),
    ('7f86d8ca-b89d-4b1f-86c5-4aa0b94ff6f0', 'rest:apps-read', 'PORTAL_OPERATIONS', 1, CURRENT_TIMESTAMP),
    ('5d8ce5e5-aee1-4d73-8d4a-9f6d5cd7c8b9', 'rest:apps-read', 'PORTAL_HR', 2, CURRENT_TIMESTAMP),
    ('de9528ff-0d7a-4515-b699-c7241ea9c0b3', 'rest:apps-read', 'PORTAL_ADMIN', 3, CURRENT_TIMESTAMP),
    ('1bb0897a-47c1-49e0-9d54-6b670d2f8d32', 'rest:apps-admin', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('d8016af8-04f0-43ba-b815-91d26df7f0df', 'route:admin-apps', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("resourceId", "permissionCode") DO UPDATE
SET
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = EXCLUDED."updatedAt";
