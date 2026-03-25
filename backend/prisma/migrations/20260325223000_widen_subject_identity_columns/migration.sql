ALTER TABLE "assignments"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "audit_log"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "security_audit_log"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "application_audit_log"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "query_audit_log"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "local_credentials"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "entity_query_cursor_cache"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "report_query_cursor_cache"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "acl_contact_permissions"
  ALTER COLUMN "contactId" TYPE VARCHAR(128);

ALTER TABLE "report_folders"
  ALTER COLUMN "ownerContactId" TYPE VARCHAR(128);

ALTER TABLE "report_definitions"
  ALTER COLUMN "ownerContactId" TYPE VARCHAR(128);

ALTER TABLE "dashboard_folders"
  ALTER COLUMN "ownerContactId" TYPE VARCHAR(128);

ALTER TABLE "dashboard_definitions"
  ALTER COLUMN "ownerContactId" TYPE VARCHAR(128);
