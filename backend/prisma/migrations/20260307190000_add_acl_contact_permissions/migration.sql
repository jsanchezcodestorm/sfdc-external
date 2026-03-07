CREATE TABLE "acl_contact_permissions" (
    "contactId" VARCHAR(18) NOT NULL,
    "permissionCode" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acl_contact_permissions_pkey" PRIMARY KEY ("contactId", "permissionCode")
);

CREATE INDEX "acl_contact_permissions_contactId_idx"
    ON "acl_contact_permissions"("contactId");

CREATE INDEX "acl_contact_permissions_permissionCode_idx"
    ON "acl_contact_permissions"("permissionCode");
