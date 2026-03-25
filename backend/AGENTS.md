# AGENTS.md

## Scope

These instructions apply to all files under `backend/`.
Read root [AGENTS.md](/Users/jeanpaul/projects/cs-repository/sfdc-external/AGENTS.md) first for repo-wide invariants.

## Backend Role

`backend/` contains all server-side logic:

* NestJS controllers, services, and modules
* Prisma access and schema management
* Salesforce access through `platform-connectors-service`
* Authentication, ACL, visibility enforcement, and audit-related behavior

Frontend clients must consume backend APIs. Do not move backend responsibilities into the UI.

## Architecture Rules

Main modules include:

```text
AuthModule
AclModule
SalesforceModule
EntitiesModule
QueryModule
NavigationModule
GlobalSearchModule
VisibilityModule
```

Respect layer boundaries:

* Controllers: REST entrypoints, DTO validation, guards, ACL entry checks
* Services: business logic, orchestration, transactions, visibility-aware operations
* Repositories and Prisma-facing code: query composition, persistence, row-level filtering
* Integrations: Salesforce and external auth providers

Do not put Salesforce logic in controllers.
Do not bypass service-layer orchestration by embedding business logic in controllers or repositories.

## Security-Critical Rules

Always:

* Enforce session and auth guards before protected operations.
* Enforce ACL before business logic for protected resources.
* Apply visibility predicates to protected data access.
* Validate DTOs and input boundaries.
* Keep sensitive access decisions auditable.
* Use opaque or signed cursor handling for paginated `queryMore` style flows.

Never:

* Expose Salesforce tokens outside the backend.
* Trust client-provided identifiers without validation.
* Bypass ACL checks.
* Bypass visibility filters.
* Enable raw `/salesforce/query` in production by default.

## Salesforce Integration

Pattern:

```text
Controller -> Service -> SalesforceService -> platform-connectors-service -> jsforce client
```

Rules:

* Centralize SOQL and remote query execution in backend integration code.
* Avoid large synchronous queries when incremental or paginated access is possible.
* Design for Salesforce rate limits, eventual consistency, query selectivity limits, and partial failure handling.
* Prefer explicit retry and incremental fetch strategies over ad hoc retry loops.

## Prisma And Database

Source of truth:

* Schema: `backend/prisma/schema.prisma`
* Migrations: `backend/prisma/migrations`

Commands:

```bash
npm run prisma:generate --workspace backend
npm run prisma:migrate:dev --workspace backend
npm run prisma:migrate:deploy --workspace backend
npm run prisma:validate --workspace backend
```

Rules:

* Never edit the database manually.
* Use forward-only migrations for production changes.
* Avoid destructive production migrations unless explicitly planned and reviewed.
* Regenerate the Prisma client after schema changes.

## Change Rules

When changing backend behavior:

1. Update DTOs, config contracts, and validation.
2. Update ACL resources if the exposed capability changes.
3. Update service logic.
4. Update visibility enforcement.
5. Update controller behavior or routes.
6. Update audit behavior and verification.

Do not add compatibility fallback paths only to avoid updating consumers.
If a backend contract changes, update consumers explicitly.

## Verification

Run the checks that match the change:

```bash
npm run lint --workspace backend
npm run build --workspace backend
```

Also run Prisma validation and generation if schema changed.
For security-sensitive changes, verify auth, ACL, visibility, and audit behavior explicitly.

## Reference Docs

Consult these before non-trivial backend changes:

* `docs/architecture-overview.md`
* `docs/security-model.md`
* `docs/acl-resources-map.md`
* `docs/entity-config-guide.md`
* `docs/query-template-guide.md`
* `docs/visibility-cones-guide.md`
* `docs/prisma-postgres-guide.md`
* `docs/runbook-production.md`
