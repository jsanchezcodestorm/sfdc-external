DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'assignments_selector_not_all_null'
    ) THEN
        ALTER TABLE "assignments"
            ADD CONSTRAINT "assignments_selector_not_all_null"
            CHECK ("contactId" IS NOT NULL OR "permissionCode" IS NOT NULL OR "recordType" IS NOT NULL);
    END IF;
END $$;

DELETE FROM "acl_resource_permissions"
WHERE "resourceId" = 'rest:visibility-debug';

DELETE FROM "acl_resources"
WHERE "id" = 'rest:visibility-debug';

INSERT INTO "acl_resources" ("id", "type", "target", "description", "updatedAt")
VALUES (
    'rest:visibility-admin',
    'REST',
    '/visibility/admin',
    'Gestione amministrativa visibility cones, rules, assignments e debug',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE
SET
    "type" = EXCLUDED."type",
    "target" = EXCLUDED."target",
    "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "acl_resource_permissions" ("id", "resourceId", "permissionCode", "sortOrder", "updatedAt")
VALUES (
    '3d7f322a-3c91-4ea1-b3ac-9b7c3f1b3211',
    'rest:visibility-admin',
    'PORTAL_ADMIN',
    0,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("resourceId", "permissionCode") DO UPDATE
SET
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;
