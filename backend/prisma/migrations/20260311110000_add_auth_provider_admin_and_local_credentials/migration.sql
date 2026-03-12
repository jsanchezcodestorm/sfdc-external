CREATE TYPE "AuthProviderType" AS ENUM ('OIDC', 'LOCAL');

CREATE TABLE "auth_provider_admin_configs" (
    "providerId" VARCHAR(64) NOT NULL,
    "type" "AuthProviderType" NOT NULL,
    "label" VARCHAR(128),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_provider_admin_configs_pkey" PRIMARY KEY ("providerId")
);

CREATE TABLE "local_credentials" (
    "contactId" VARCHAR(18) NOT NULL,
    "username" VARCHAR(320) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_credentials_pkey" PRIMARY KEY ("contactId")
);

CREATE UNIQUE INDEX "local_credentials_username_key" ON "local_credentials"("username");
CREATE INDEX "local_credentials_username_idx" ON "local_credentials"("username");
CREATE INDEX "local_credentials_enabled_updatedAt_idx" ON "local_credentials"("enabled", "updatedAt");

INSERT INTO "acl_resources" ("id", "type", "target", "description", "updatedAt")
VALUES
    ('rest:auth-admin', 'REST', '/auth/admin', 'Gestione amministrativa provider auth e credenziali locali', CURRENT_TIMESTAMP),
    ('route:admin-auth', 'ROUTE', '/admin/auth/providers', 'Pagina admin autenticazione', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET
    "type" = EXCLUDED."type",
    "target" = EXCLUDED."target",
    "description" = EXCLUDED."description",
    "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "acl_resource_permissions" ("id", "resourceId", "permissionCode", "sortOrder", "updatedAt")
VALUES
    ('a7f9a8c4-381c-4400-a40f-2a3198035d4c', 'rest:auth-admin', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('6b20c2fb-6a8d-4527-bfd4-91f496c0e90f', 'route:admin-auth', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("resourceId", "permissionCode") DO UPDATE
SET
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = EXCLUDED."updatedAt";
