# sfdc-external

Middleware full-stack TypeScript integrato con Salesforce, con backend NestJS e frontend React/Vite.

Repository path canonico:

* [`/Users/jeanpaul/projects/cs-repository/sfdc-external`](/Users/jeanpaul/projects/cs-repository/sfdc-external)

Stack root locale:

* [`/Users/jeanpaul/projects/cs-repository/platform-local-stack`](/Users/jeanpaul/projects/cs-repository/platform-local-stack)

Nel primo taglio di migrazione il `backend/` di questo repo resta il BFF di prodotto.
L'auth condivisa e i connector Salesforce runtime vivono nei servizi platform sotto [`/Users/jeanpaul/projects/cs-repository/platform-auth-service`](/Users/jeanpaul/projects/cs-repository/platform-auth-service) e [`/Users/jeanpaul/projects/cs-repository/platform-connectors-service`](/Users/jeanpaul/projects/cs-repository/platform-connectors-service).

## Stack

- Node.js 22 LTS
- npm workspaces
- Backend: NestJS + TypeScript
- Frontend: React + Vite + TypeScript + Tailwind
- Salesforce: jsforce
- Database: PostgreSQL
- ORM: Prisma
- Auth: shared session via `platform-auth-service`

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

## Avvio locale canonico

Bootstrap completo dello stack:

```bash
cd /Users/jeanpaul/projects/cs-repository/platform-local-stack
npm install
npm run start:dev
```

URL canonico:

* `http://sfdc.cs.lvh.me:8080`

Comandi repo-locali utili solo per debug puntuale:

```bash
npm run start:dev --workspace backend
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
- Tutte le chiamate Salesforce passano dal backend di prodotto, che a sua volta orchestri `platform-connectors-service`.
- ACL + Visibility Engine con policy deny-by-default.
- Sessione condivisa emessa da `platform-auth-service` in cookie HttpOnly.

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
