INSERT INTO "acl_resources" ("id", "type", "target", "description", "updatedAt")
VALUES
    (
        'rest:audit-read',
        'REST',
        '/audit',
        'Consultazione read-only degli stream audit PostgreSQL',
        CURRENT_TIMESTAMP
    ),
    (
        'route:admin-audit',
        'ROUTE',
        '/admin/audit',
        'Pagina admin consultazione audit centralizzato',
        CURRENT_TIMESTAMP
    )
ON CONFLICT ("id") DO UPDATE
SET
    "type" = EXCLUDED."type",
    "target" = EXCLUDED."target",
    "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "acl_resource_permissions" ("id", "resourceId", "permissionCode", "sortOrder", "updatedAt")
VALUES
    (
        '41ce8356-4bf1-41c0-8b57-0e7c4aa25761',
        'rest:audit-read',
        'PORTAL_ADMIN',
        0,
        CURRENT_TIMESTAMP
    ),
    (
        'e0dbb342-6f89-43e5-8d89-a8e9462d7c62',
        'route:admin-audit',
        'PORTAL_ADMIN',
        0,
        CURRENT_TIMESTAMP
    )
ON CONFLICT ("resourceId", "permissionCode") DO UPDATE
SET
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;
