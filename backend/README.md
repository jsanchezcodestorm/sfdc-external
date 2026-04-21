# Backend

Backend NestJS del middleware Salesforce con ACL + Visibility deny-by-default.

## Avvio rapido

```bash
cd ../../platform-local-stack
npm install
npm run check-paths
npm run start:dev -- sfdcBackend
```

Il bootstrap canonico dell'intero stack resta [`platform-local-stack`](/Users/jeanpaul/projects/cs-repository/platform-local-stack). Questo workspace espone il BFF pubblico su `http://sfdc.cs.lvh.me:8080/api/*`.

`platform-local-stack` risolve i repo sibling dal `git origin` configurato, quindi i nomi cartella locali non devono più essere uniformati manualmente.

## Setup Prisma

```bash
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma
npm exec --workspace backend prisma -- migrate dev --schema prisma/schema.prisma
```

## Endpoint base

- `GET /api/health`
- `GET /api/auth/providers`
- `GET /api/auth/oidc/:providerId/start`
- `GET /api/auth/oidc/:providerId/callback`
- `POST /api/auth/login/password`
- `GET /api/auth/csrf`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/auth/admin/providers`
- `GET /api/auth/admin/providers/:providerId`
- `PUT /api/auth/admin/providers/:providerId`
- `GET /api/auth/admin/local-credentials`
- `PUT /api/auth/admin/local-credentials/:contactId`
- `DELETE /api/auth/admin/local-credentials/:contactId`
- `GET /api/navigation`
- `GET /api/entities/:entityId/config`
- `GET /api/entities/:entityId/list`
- `GET /api/entities/:entityId/records/:recordId`
- `GET /api/entities/:entityId/form`
- `GET /api/entities/:entityId/form/:recordId`
- `GET /api/entities/:entityId/related/:relatedListId`
- `POST /api/entities/:entityId/records`
- `PUT /api/entities/:entityId/records/:recordId`
- `DELETE /api/entities/:entityId/records/:recordId`
- `POST /api/query/template/:templateId`
- `GET /api/global-search?q=...`
- `GET /api/salesforce/objects`
- `POST /api/visibility/evaluate`

Le route `/api/auth/*` e `/api/setup/*` sono facade: l'issuer di sessione e i provider auth stanno in `platform-auth-service`, mentre setup Salesforce e query connector passano da `platform-connectors-service`.
