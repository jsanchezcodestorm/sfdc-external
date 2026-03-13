CREATE TYPE "AclResourceAccessMode" AS ENUM ('DISABLED', 'AUTHENTICATED', 'PERMISSION_BOUND');
CREATE TYPE "AclResourceManagedBy" AS ENUM ('MANUAL', 'SYSTEM');
CREATE TYPE "AclResourceSyncState" AS ENUM ('PRESENT', 'STALE');

ALTER TABLE "acl_resources"
    ADD COLUMN "accessMode" "AclResourceAccessMode" NOT NULL DEFAULT 'AUTHENTICATED',
    ADD COLUMN "managedBy" "AclResourceManagedBy" NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN "syncState" "AclResourceSyncState" NOT NULL DEFAULT 'PRESENT',
    ADD COLUMN "sourceType" "AclResourceKind",
    ADD COLUMN "sourceRef" VARCHAR(256);

UPDATE "acl_resources" AS resource
SET "accessMode" = CASE
    WHEN EXISTS (
        SELECT 1
        FROM "acl_resource_permissions" permission
        WHERE permission."resourceId" = resource."id"
    ) THEN 'PERMISSION_BOUND'::"AclResourceAccessMode"
    ELSE 'AUTHENTICATED'::"AclResourceAccessMode"
END;

CREATE INDEX "acl_resources_managedBy_syncState_idx"
ON "acl_resources"("managedBy", "syncState");
