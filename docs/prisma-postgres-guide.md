# Prisma + PostgreSQL Guide

## 1) Scopo
Questo documento definisce come usare Prisma con PostgreSQL per il layer tecnico middleware.

Obiettivo principale:
- repository unico PostgreSQL per policy visibility, cache e audit
- workflow migrazioni ripetibile tra `dev`, `staging`, `prod`
- integrazione pulita con backend NestJS

## 2) Decisioni architetturali
Decisioni vincolanti:
- Salesforce resta system of record business
- PostgreSQL gestisce solo dati tecnici middleware (visibility/cache/audit)
- Prisma e l unico strumento ORM/migration per il database applicativo

Ambito minimo tabelle:
- `visibility.cones`
- `visibility.rules`
- `visibility.assignments`
- `visibility.user_scope_cache`
- `visibility.audit_log`
- tabella versione policy (`visibility.policy_meta`)

## 3) Prerequisiti
- Node.js `>= 18` (target progetto: 22 LTS)
- PostgreSQL `>= 14`
- backend workspace disponibile (`backend/`)

## 4) Installazione Prisma nel backend
Dal root monorepo:

```bash
npm install @prisma/client --workspace backend
npm install -D prisma --workspace backend
```

Init (se progetto nuovo):

```bash
npm exec --workspace backend prisma -- init --schema prisma/schema.prisma
```

## 5) Struttura filesystem consigliata
```text
backend/
  prisma/
    schema.prisma
    migrations/
  src/
    prisma/
      prisma.module.ts
      prisma.service.ts
```

## 6) Variabili ambiente minime
Backend `.env`:
- `DATABASE_URL`
- `SHADOW_DATABASE_URL` (raccomandata per `migrate dev`)
- `VISIBILITY_DB_SCHEMA` (default `visibility`)
- `VISIBILITY_CACHE_TTL_SECONDS`
- `VISIBILITY_AUDIT_ENABLED`
- `VISIBILITY_POLICY_PROPAGATION_TARGET_SECONDS` (default `30`)
- `VISIBILITY_POLICY_PROPAGATION_HARD_LIMIT_SECONDS` (default `120`)
- `VISIBILITY_AUDIT_RETENTION_DAYS` (default `180`)
- `VISIBILITY_AUDIT_AGGREGATE_RETENTION_MONTHS` (default `24`)

Esempio URL (search_path esplicito):

```env
DATABASE_URL="postgresql://app_rw:***@localhost:5432/codestorm?schema=visibility"
SHADOW_DATABASE_URL="postgresql://app_rw:***@localhost:5432/codestorm_shadow?schema=visibility"
```

Nota:
- se usi schema diverso da `public`, crea lo schema in migrazione SQL iniziale.

## 7) `schema.prisma` baseline (visibility)
Esempio baseline allineato al modello visibility:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum VisibilityRuleEffect {
  ALLOW
  DENY
}

enum VisibilityDecision {
  ALLOW
  DENY
}

model VisibilityPolicyMeta {
  id            Int      @id @default(1)
  policyVersion BigInt   @default(1)
  updatedAt     DateTime @updatedAt

  @@map("policy_meta")
}

model VisibilityCone {
  id        String                 @id @default(uuid()) @db.Uuid
  code      String                 @unique @db.VarChar(64)
  name      String                 @db.VarChar(128)
  priority  Int                    @default(0)
  active    Boolean                @default(true)
  updatedAt DateTime               @updatedAt
  rules     VisibilityRule[]
  assignments VisibilityAssignment[]

  @@map("cones")
}

model VisibilityRule {
  id           String               @id @default(uuid()) @db.Uuid
  coneId       String               @db.Uuid
  objectApiName String              @db.VarChar(128)
  effect       VisibilityRuleEffect
  conditionJson Json
  fieldsAllowed Json?
  active       Boolean              @default(true)
  updatedAt    DateTime             @updatedAt
  cone         VisibilityCone       @relation(fields: [coneId], references: [id], onDelete: Cascade)

  @@index([objectApiName, active])
  @@map("rules")
}

model VisibilityAssignment {
  id            String         @id @default(uuid()) @db.Uuid
  coneId        String         @db.Uuid
  contactId     String?        @db.VarChar(18)
  permissionCode String?       @db.VarChar(80)
  recordType    String?        @db.VarChar(80)
  validFrom     DateTime?
  validTo       DateTime?
  updatedAt     DateTime       @updatedAt
  cone          VisibilityCone @relation(fields: [coneId], references: [id], onDelete: Cascade)

  @@index([contactId, permissionCode, recordType, validFrom, validTo])
  @@map("assignments")
}

model VisibilityUserScopeCache {
  cacheKey         String   @id @db.VarChar(255)
  objectApiName    String   @db.VarChar(128)
  policyVersion    BigInt
  compiledPredicate String  @db.Text
  compiledFields   Json?
  expiresAt        DateTime
  updatedAt        DateTime @updatedAt

  @@index([objectApiName, policyVersion])
  @@index([expiresAt])
  @@map("user_scope_cache")
}

model VisibilityAuditLog {
  id                 BigInt             @id @default(autoincrement())
  requestId          String             @db.VarChar(64)
  createdAt          DateTime           @default(now())
  contactId          String             @db.VarChar(18)
  permissionsHash    String             @db.VarChar(128)
  recordType         String?            @db.VarChar(80)
  objectApiName      String             @db.VarChar(128)
  queryKind          String             @db.VarChar(64)
  baseWhereHash      String             @db.VarChar(128)
  finalWhereHash     String             @db.VarChar(128)
  appliedCones       Json
  appliedRules       Json
  decision           VisibilityDecision
  decisionReasonCode String             @db.VarChar(64)
  rowCount           Int
  durationMs         Int
  policyVersion      BigInt

  @@index([createdAt])
  @@index([contactId, createdAt])
  @@index([objectApiName, createdAt])
  @@index([decisionReasonCode, createdAt])
  @@map("audit_log")
}
```

Nota importante:
- l esempio usa `@@map("...")` per nomi tabella puliti.
- se vuoi lo schema fisico `visibility` separato da `public`, aggiungi migrazione SQL che crea schema e setta search_path (o usa feature multi-schema della tua versione Prisma se supportata).

## 8) Migrazione iniziale
Genera e applica migrazione locale:

```bash
npm exec --workspace backend prisma -- migrate dev --schema prisma/schema.prisma --name init_visibility
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma
```

Controllo stato:

```bash
npm exec --workspace backend prisma -- migrate status --schema prisma/schema.prisma
```

## 9) Workflow migrazioni per ambiente
### 9.1 Development
- usa `prisma migrate dev`
- committa sempre cartella `prisma/migrations/*`
- rigenera client Prisma dopo cambi schema

### 9.2 Staging/Production
- non usare `migrate dev`
- usare solo:

```bash
npm exec --workspace backend prisma -- migrate deploy --schema prisma/schema.prisma
```

Regola release:
- deploy app solo dopo `migrate deploy` riuscito
- rollback applicativo non deve ignorare lo stato migrazioni DB

## 10) CI/CD minima consigliata
Ordine consigliato pipeline backend:
1. install dipendenze
2. `npm exec --workspace backend prisma -- validate --schema prisma/schema.prisma`
3. `npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma`
4. lint + typecheck + build
5. deploy artifact
6. `prisma migrate deploy`
7. smoke test API protette

## 11) Integrazione NestJS (`PrismaService`)
Pattern consigliato:
- singleton `PrismaService` che estende `PrismaClient`
- connect su bootstrap
- disconnect su shutdown hooks

Indicazione operativa:
- non creare `new PrismaClient()` in service dominio
- centralizzare transazioni complesse in repository dedicati

## 12) Transazioni e atomicita policy
Per rispettare invalidazione cache + versione policy atomica:
- applicare modifiche policy dentro singola transazione DB
- aggiornare `policy_meta.policyVersion` nella stessa transazione
- invalidare cache target nella stessa transazione

Pseudoflusso atomico:
1. update/insert su `cones/rules/assignments`
2. increment `policy_meta.policyVersion`
3. delete cache entries coinvolte (`user_scope_cache`)
4. commit

Fallback:
- se transazione fallisce -> nessun aggiornamento policy visibile

## 13) Query e indici obbligatori per performance
Indici minimi richiesti:
- `rules(object_api_name, active)`
- `assignments(contact_id, permission_code, record_type, valid_from, valid_to)`
- `user_scope_cache(expires_at)`
- `audit_log(created_at)`

Consigli addizionali:
- partizionamento mensile `audit_log` se volume alto
- job periodico purge cache scaduta
- job retention audit secondo policy giorni/mesi

## 14) Retention e housekeeping
Regole minime:
- dettaglio audit: `180 giorni`
- aggregati audit: `24 mesi`

Routine operative:
- purge `user_scope_cache` su `expires_at < now()`
- purge/archiviazione `audit_log` secondo retention
- `VACUUM (ANALYZE)` pianificato su tabelle ad alta scrittura

## 15) Sicurezza database
Regole minime:
- utente applicativo dedicato non superuser
- least privilege sul solo schema middleware
- TLS attivo verso DB in ambienti non locali
- backup cifrati + restore testato

Permessi raccomandati ruolo app:
- `SELECT/INSERT/UPDATE/DELETE` su tabelle visibility
- niente `CREATE DATABASE`
- niente `SUPERUSER`

## 16) Operazioni ad alto rischio e guardrail
Operazioni sensibili:
- `migrate reset`
- drop schema/table
- SQL manuale fuori migrazione versionata

Guardrail:
- vietare reset/drop in production
- ogni patch SQL deve vivere in migrazione tracciata
- backup snapshot prima di migrazioni strutturali

## 17) Troubleshooting rapido
Errori tipici Prisma:
- `P1001`: DB non raggiungibile
- `P3005/P3014`: storia migrazioni incoerente
- `P2021`: tabella mancante rispetto al client

Checklist:
1. verificare `DATABASE_URL` e reachability DB
2. verificare `prisma migrate status`
3. verificare che client Prisma sia rigenerato
4. verificare allineamento branch/migrations

## 18) Checklist "ready for prod"
- [ ] schema visibility creato e migrato via Prisma
- [ ] `prisma migrate deploy` integrato in pipeline
- [ ] index minimi presenti
- [ ] retention jobs configurati
- [ ] backup/restore testati
- [ ] transazioni atomiche policy+version+cache implementate
- [ ] metriche e alert DB attivi

## 19) Comandi operativi rapidi
```bash
# valida schema
npm exec --workspace backend prisma -- validate --schema prisma/schema.prisma

# genera client
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma

# migrazione locale
npm exec --workspace backend prisma -- migrate dev --schema prisma/schema.prisma --name <change_name>

# stato migrazioni
npm exec --workspace backend prisma -- migrate status --schema prisma/schema.prisma

# deploy migrazioni (staging/prod)
npm exec --workspace backend prisma -- migrate deploy --schema prisma/schema.prisma
```

## 20) Documenti correlati
- `docs/architecture-overview.md`
- `docs/security-model.md`
- `docs/visibility-cones-guide.md`
- `docs/query-template-guide.md`
- `docs/runbook-production.md`
