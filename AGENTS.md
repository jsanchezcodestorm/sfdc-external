# AGENTS.md

## Project Overview

This repository is a **full-stack TypeScript monorepo** for a Salesforce-integrated middleware application.

Stack:

* Runtime: **Node.js 22 LTS**
* Package manager: **npm workspaces**
* Backend: **NestJS + TypeScript**
* Frontend: **React + Vite + TypeScript + Tailwind**
* Salesforce integration: **jsforce**
* Database: **PostgreSQL**
* ORM: **Prisma**
* Authentication: **Google Identity + JWT session in HttpOnly cookies**
* Security model: **ACL + visibility engine (deny-by-default)**

The system exposes backend APIs and frontend UI over Salesforce data with **fine-grained access control**.

---

# Repository Structure

```text
/backend
  /src
  /config
  /prisma

/frontend
  /src

/docs
  architecture-overview.md
  security-model.md
  visibility-cones-guide.md
  acl-resources-map.md
  entity-config-guide.md
  query-template-guide.md
  prisma-postgres-guide.md
  runbook-production.md

AGENTS.md
package.json
```

Key rules:

* **backend contains all server logic**
* **frontend never talks directly to Salesforce**
* **all Salesforce access happens via backend services**

---

# Setup

Requirements

```bash
node >= 22
npm >= 10
postgres >= 14 (recommended 15+)
```

Install dependencies

```bash
npm install
```

Generate Prisma client

```bash
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma
```

Run database migrations (local)

```bash
npm exec --workspace backend prisma -- migrate dev --schema prisma/schema.prisma
```

---

# Development Commands

Start backend

```bash
npm run start:dev --workspace backend
```

Start frontend

```bash
npm run dev --workspace frontend
```

Build (monorepo)

```bash
npm run build
```

Lint (all workspaces)

```bash
npm run lint --workspaces
```

---

# Backend Architecture

Framework: **NestJS**

Main modules:

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

### Layers

Controller

```text
REST entrypoints
DTO validation
Session/auth guards
ACL checks
```

Service

```text
business logic
transaction orchestration
visibility checks
```

Repository

```text
Prisma access
query composition
row-level filters
```

External integrations

```text
SalesforceService (jsforce)
GoogleAuthService
```

---

# Salesforce Integration

Library

```text
jsforce
```

Pattern

```text
Backend service
   -> SalesforceService / Connector
       -> jsforce client
```

Rules

* No Salesforce logic in controllers
* Centralize SOQL/query execution in backend connector and query engine
* Avoid large synchronous queries
* Keep raw `/salesforce/query` disabled in production by default

Example

```ts
const conn = new jsforce.Connection({
  accessToken,
  instanceUrl,
})

await conn.sobject("Account").find({ Id: accountId })
```

---

# Authentication Model

Authentication flow

```text
Google Identity
      ↓
Backend callback
      ↓
JWT session created
      ↓
JWT stored in HttpOnly cookie
```

Rules

* JWT never accessible from frontend JavaScript
* Session validation happens in backend guards
* User identity is resolved before ACL/visibility evaluation

---

# Authorization Model

Security is based on **two layers**:

1. ACL
2. Visibility Engine

### ACL

Controls access to:

```text
REST endpoint
entity
query template
route
```

ACL resources follow:

```text
rest:*
entity:*
query:*
route:*
```

ACL evaluation happens before service business logic.

Example

```ts
user.can("query:account.pipeline")
user.can("entity:opportunity")
```

---

### Visibility Engine

Row-level and field-level access control.

Default policy:

```text
DENY BY DEFAULT
```

A record is visible only if an explicit rule allows it.

Examples

```text
owner_id = user_id
organization_id IN user_orgs
record_type IN allowed_record_types
```

Implementation layer

```text
Prisma + compiled visibility predicates
```

Example

```ts
where: {
  AND: [
    baseFilters,
    visibilityFilters,
  ],
}
```

---

# Database

Database

```text
PostgreSQL
```

ORM

```text
Prisma
```

Important visibility tables

```text
visibility.cones
visibility.rules
visibility.assignments
visibility.user_scope_cache
visibility.audit_log
visibility.policy_meta
```

Key responsibilities

```text
policy storage
access scope caching
visibility audit tracking
```

---

# Prisma Workflow

Generate client

```bash
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma
```

Development migration

```bash
npm exec --workspace backend prisma -- migrate dev --schema prisma/schema.prisma
```

Production deployment

```bash
npm exec --workspace backend prisma -- migrate deploy --schema prisma/schema.prisma
```

Rules

* Never modify DB manually
* All schema changes via migrations
* Always regenerate client after schema changes

---

# Production Pipeline

Pipeline steps

```text
install
lint
build
prisma validate
prisma generate
prisma migrate deploy
start service
```

Migration strategy

```text
forward only
no destructive migrations in production
```

Runbook location

```text
docs/runbook-production.md
```

---

# Frontend Architecture

Framework

```text
React + Vite
```

Styling

```text
Tailwind
```

Rules

* UI components stay presentation-focused
* Business/security logic lives in backend
* API access only through backend endpoints (`/api/*`)
* Requests use cookie session (`credentials: "include"`)

Example

```ts
fetch("/api/query", {
  method: "POST",
  credentials: "include",
})
```

---

# Logging & Audit

Visibility audit logs are stored in PostgreSQL.

Table

```text
visibility.audit_log
```

Captured events include:

```text
visibility ALLOW/DENY decisions
policy/cache invalidation events
security gateway denials (auth/csrf/cursor scope)
permission failures
```

All sensitive access decisions and policy changes must be auditable.

---

# Coding Conventions

Language

```text
TypeScript strict mode
```

Naming

```text
camelCase for variables
PascalCase for classes
UPPER_CASE for constants
```

Files

```text
*.service.ts
*.controller.ts
*.module.ts
```

Rules

* Prefer dependency injection
* Avoid static mutable state
* Keep services testable

---

# Security Rules

Never

* expose Salesforce tokens to frontend
* trust client-provided identifiers without validation
* bypass ACL checks
* bypass visibility filters
* enable raw Salesforce query endpoints in production by default

Always

* validate DTOs and input boundaries
* enforce session/auth guards
* enforce ACL before business logic
* apply visibility engine to protected data queries
* use opaque/signed cursor handling for `queryMore` flows

---

# When Implementing Features

Follow this order

1. Define DTO and config contract
2. Add/update ACL resource
3. Implement backend service logic
4. Apply visibility policy enforcement
5. Expose controller endpoint
6. Add audit events and tests

---

# Known Constraints

Salesforce APIs have:

* rate limits
* eventual consistency
* query size/selectivity limits

Backend must handle:

* retry policies
* incremental fetch/sync patterns
* opaque cursor validation for pagination
* partial failures with safe fallback

---

# Documentation

Primary references

```text
docs/architecture-overview.md
docs/security-model.md
docs/acl-resources-map.md
docs/entity-config-guide.md
docs/query-template-guide.md
docs/visibility-cones-guide.md
docs/prisma-postgres-guide.md
docs/runbook-production.md
docs/solution.md
```

Agents should consult these documents before implementing complex changes.
