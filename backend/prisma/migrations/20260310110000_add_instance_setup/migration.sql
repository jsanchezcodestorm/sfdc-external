CREATE TYPE "SetupSalesforceMode" AS ENUM ('USERNAME_PASSWORD', 'ACCESS_TOKEN');

CREATE TABLE "instance_setup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "siteName" VARCHAR(128) NOT NULL,
    "adminEmail" VARCHAR(320) NOT NULL,
    "salesforceMode" "SetupSalesforceMode" NOT NULL,
    "salesforceConfigEncrypted" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_setup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "instance_setup_singleton_check" CHECK ("id" = 1)
);
