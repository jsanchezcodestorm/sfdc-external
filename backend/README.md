# Backend

Backend NestJS del middleware Salesforce con ACL + Visibility deny-by-default.

## Avvio rapido

```bash
npm install
npm run start:dev --workspace backend
```

## Setup Prisma

```bash
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma
npm exec --workspace backend prisma -- migrate dev --schema prisma/schema.prisma
```

## Endpoint base

- `GET /api/health`
- `POST /api/auth/google`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/navigation`
- `GET /api/entities/:entityId`
- `POST /api/query/template/:templateId`
- `GET /api/global-search?q=...`
- `GET /api/salesforce/objects`
- `POST /api/visibility/evaluate`
