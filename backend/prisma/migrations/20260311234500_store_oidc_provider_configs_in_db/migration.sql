ALTER TABLE "auth_provider_admin_configs"
ADD COLUMN "configJson" JSONB,
ADD COLUMN "clientSecretEncrypted" TEXT;
