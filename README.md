# sfdc-external

Middleware full-stack TypeScript integrato con Salesforce, con backend NestJS e frontend React/Vite.

## Stack

- Node.js 22 LTS
- npm workspaces
- Backend: NestJS + TypeScript
- Frontend: React + Vite + TypeScript + Tailwind
- Salesforce: jsforce
- Database: PostgreSQL
- ORM: Prisma
- Auth: Google Identity + JWT in cookie HttpOnly

## Struttura repository

```text
/backend
  /src
  /config
  /prisma

/frontend
  /src

/docs
AGENTS.md
package.json
```

## Prerequisiti

- `node >= 22`
- `npm >= 10`
- `postgres >= 14` (consigliato 15+)

## Setup rapido

Installazione dipendenze:

```bash
npm install
```

Generazione client Prisma:

```bash
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma
```

Migrazioni locali:

```bash
npm exec --workspace backend prisma -- migrate dev --schema prisma/schema.prisma
```

## Avvio in sviluppo

Backend:

```bash
npm run start:dev --workspace backend
```

Frontend:

```bash
npm run dev --workspace frontend
```

## Build e lint

Build monorepo:

```bash
npm run build
```

Lint workspaces:

```bash
npm run lint --workspaces
```

## Principi di sicurezza

- Il frontend non parla mai direttamente con Salesforce.
- Tutte le chiamate Salesforce passano dal backend.
- ACL + Visibility Engine con policy deny-by-default.
- JWT session in cookie HttpOnly.

## Documentazione

- `docs/architecture-overview.md`
- `docs/security-model.md`
- `docs/acl-resources-map.md`
- `docs/entity-config-guide.md`
- `docs/query-template-guide.md`
- `docs/visibility-cones-guide.md`
- `docs/prisma-postgres-guide.md`
- `docs/runbook-production.md`
- `docs/solution.md`
