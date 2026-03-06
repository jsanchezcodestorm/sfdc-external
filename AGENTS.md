# AGENTS.md

## Purpose

This repository is a full-stack TypeScript monorepo for a Salesforce-integrated middleware application.

Use this file as the entry point. Keep root-level instructions short and durable.
Read the nearest `AGENTS.md` before changing code in `backend/` or `frontend/`.

## Stack Snapshot

* Runtime: Node.js 22 LTS
* Package manager: npm workspaces
* Backend: NestJS + TypeScript + Prisma + PostgreSQL + jsforce
* Frontend: React + Vite + TypeScript + Tailwind
* Auth: Google Identity + JWT session in HttpOnly cookies
* Security model: ACL + visibility engine, deny by default

## Repository Map

```text
/backend   NestJS API, Prisma schema, Salesforce integration, security enforcement
/frontend  React UI, backend API client usage only
/docs      Architecture, security, visibility, entity, query, and runbook guides
```

Local instruction files:

* `backend/AGENTS.md`
* `frontend/AGENTS.md`

## Core Invariants

* All Salesforce access happens in the backend.
* Frontend code must never call Salesforce directly.
* Backend must enforce authentication, ACL, and visibility before protected data is returned.
* Visibility policy is deny by default. Do not bypass visibility filters.
* JWT session state must remain in HttpOnly cookies and must not be exposed to frontend JavaScript.
* Raw Salesforce query endpoints must remain disabled in production unless there is an explicit, documented reason.

## Design Rules

* Keep services, controllers, repositories, React components, hooks, and utilities small, single-purpose, and composable.
* Split units that accumulate unrelated responsibilities. Do not grow "god" modules.
* Keep business logic and security logic in the backend. Keep frontend components presentation-focused.
* Prefer explicit contracts and dependency injection over hidden coupling or convenience shortcuts.
* Do not add fallback code paths, compatibility shims, dual contracts, or silent branching only to preserve backward compatibility.
* If a contract changes, update the contract and all known consumers in the same change whenever feasible.
* Backward-compatibility exceptions require an explicit operational or rollout reason and must be documented in the change.

## Implementation Priorities

When adding or changing a feature:

1. Define or update the DTO and config contract.
2. Add or update the ACL resource.
3. Implement backend service logic.
4. Apply visibility policy enforcement.
5. Expose or update the controller endpoint.
6. Add audit coverage and verification.

## Setup And Commands

Requirements:

```bash
node >= 22
npm >= 10
postgres >= 14
```

Install dependencies:

```bash
npm install
```

Useful commands:

```bash
npm run build
npm run lint --workspaces
npm run start:dev --workspace backend
npm run dev --workspace frontend
```

Prisma workflow:

```bash
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma
npm exec --workspace backend prisma -- migrate dev --schema prisma/schema.prisma
npm exec --workspace backend prisma -- migrate deploy --schema prisma/schema.prisma
```

Rules:

* Never modify the database manually.
* All schema changes must go through Prisma migrations.
* If `backend/prisma/schema.prisma` changes, regenerate the client and run the appropriate migration command.

## Verification

Before finishing a code change, run the checks that match the scope:

* Workspace lint for touched packages.
* Relevant build commands for touched packages.
* `prisma validate` and client generation if Prisma schema changed.
* Any task-specific validation needed to prove ACL, visibility, auth, or contract updates still hold.

## Docs To Consult

Read the relevant document before making non-trivial changes:

* `docs/architecture-overview.md`
* `docs/security-model.md`
* `docs/acl-resources-map.md`
* `docs/entity-config-guide.md`
* `docs/query-template-guide.md`
* `docs/visibility-cones-guide.md`
* `docs/prisma-postgres-guide.md`
* `docs/runbook-production.md`
* `docs/solution.md`

Use the nearest source of truth:

* Root `AGENTS.md` for repo-wide invariants
* `backend/AGENTS.md` for server-side implementation rules
* `frontend/AGENTS.md` for UI and API-consumption rules
* `docs/` for detailed architecture and operational guidance
