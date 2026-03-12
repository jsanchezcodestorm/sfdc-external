INSERT INTO "acl_resources" ("id", "type", "target", "description", "updatedAt")
VALUES
    ('rest:metadata-admin', 'REST', '/metadata/admin', 'Retrieve, preview e deploy dei package metadata zip', CURRENT_TIMESTAMP),
    ('route:admin-metadata', 'ROUTE', '/admin/metadata', 'Pagina admin metadata package', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET
    "type" = EXCLUDED."type",
    "target" = EXCLUDED."target",
    "description" = EXCLUDED."description",
    "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "acl_resource_permissions" ("id", "resourceId", "permissionCode", "sortOrder", "updatedAt")
VALUES
    ('e224bc3d-2b30-423e-a4cd-607e8b5329d3', 'rest:metadata-admin', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP),
    ('8e9559cc-c415-478f-9c42-1036c7d8089d', 'route:admin-metadata', 'PORTAL_ADMIN', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("resourceId", "permissionCode") DO UPDATE
SET
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = EXCLUDED."updatedAt";
