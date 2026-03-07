# Architecture Overview

## 1) Scopo
Questo documento descrive l architettura target del middleware che integra Salesforce come system of record, con:
- backend NestJS per orchestrazione API, sicurezza e governance accessi
- frontend React/Vite per UX applicativa
- policy di visibility row-level basata su coni con repository unico PostgreSQL

## 2) Obiettivi architetturali
- mantenere Salesforce come fonte dati business primaria
- centralizzare autenticazione, ACL e visibility nel backend
- abilitare configurazione funzionale senza hardcode diffuso (entity/query config-driven)
- garantire auditabilita delle decisioni di accesso
- ridurre il rischio di data leak con modello deny-by-default

## 3) Principi guida
- separazione delle responsabilita:
  - ACL decide cosa un utente puo usare
  - visibility decide quali record/campi puo vedere
- enforcement centralizzato: nessun endpoint dati puo bypassare i guardrail comuni
- fail-closed: in caso di errore policy/visibility, accesso negato
- configurazione versionata: policy e metadati gestiti in repository e tracciati

## 4) Vista ad alto livello
```mermaid
flowchart LR
  U["Utente"] --> FE["Frontend React/Vite"]
  FE -->|"/api + cookie sessione"| BE["Backend NestJS"]
  BE --> AUTH["Auth Module (Google + JWT cookie)"]
  BE --> ACL["ACL Module"]
  BE --> QE["Query + Entities Engine"]
  BE --> VIS["Visibility Engine (coni)"]
  QE --> SF["Salesforce Org"]
  AUTH --> SF
  VIS --> PG[("PostgreSQL\npolicy/cache/audit")]
```

## 5) Componenti principali

### Backend (NestJS)
- `Auth`: login Google, sessione JWT HttpOnly, restore session
- `ACL`: risorse `rest:*`, `entity:*`, `query:*`, `route:*`
- `Apps Catalog`: catalogo app, associazioni app -> entity e permission -> app
- `Salesforce Connector`: query/CRUD/describe/search centralizzati via `jsforce`
- `Entities Engine`: configurazioni list/detail/form/related list guidate da JSON
- `Query Engine`: template query DSL/SOQL con validazioni runtime
- `Visibility Engine`: compilazione ed enforcement policy con deny-by-default

### Frontend (React/Vite)
- autenticazione tramite cookie di sessione backend
- launcher home che mostra le app disponibili per l utente autenticato
- routing protetto e navigazione dinamica guidata da ACL
- backoffice `/#/admin/apps` per il catalogo app e integrazione ACL
- consumo endpoint backend senza accesso diretto a Salesforce

### PostgreSQL (Prisma)
Repository unico per visibility:
- `visibility.cones`
- `visibility.rules`
- `visibility.assignments`
- `visibility.user_scope_cache`
- `visibility.audit_log`

Repository tecnico aggiuntivo per catalogo app e ACL:
- `app_configs`
- `app_entity_assignments`
- `app_permission_assignments`
- `acl_contact_permissions`

## 6) Flussi chiave

### 6.1 Login e sessione
1. Frontend ottiene credenziale Google
2. Backend valida token e risolve Contact Salesforce attivo
3. Backend emette JWT e lo salva in cookie HttpOnly
4. Ogni chiamata API usa cookie + guard di sessione
5. A ogni request autenticata il backend ricalcola i permission code effettivi come `defaultPermissions + acl_contact_permissions + admin fallback`

### 6.2 Lettura dati protetta
1. richiesta API autenticata
2. verifica ACL su risorsa richiesta
3. risoluzione policy visibility (utente, permessi, recordType, oggetto)
4. compilazione filtro finale (`ALLOW`/`DENY`)
5. esecuzione query verso Salesforce scoped
6. audit decisione con motivazione

### 6.3 Configurazione dinamica
- entita e query template sono lette da file versionati
- modifiche funzionali (liste, colonne, filtri, template) senza toccare codice core

### 6.4 Catalogo app e launcher
1. Il backoffice gestisce il catalogo app tramite `/#/admin/apps`
2. Ogni app puo associare piu entity configurate
3. Ogni permission puo pubblicare zero o piu app tramite `appIds`
4. La home autenticata chiama `GET /apps/available`
5. Il backend filtra le app per permission effettive e poi per ACL `entity:<entityId>`
6. Il frontend salva in `localStorage` l `appId` selezionato per utente e usa i path entity esistenti `/#/s/:entityId`

## 7) Modello di sicurezza
- autenticazione federata Google + sessione cookie sicura
- ACL obbligatoria su endpoint e risorse
- visibility centralizzata row-level e field-level
- query raw Salesforce limitata ad amministrazione/incident e disabilitata in produzione
- validazioni input e whitelist operatori/campi per DSL visibility

## 8) Visibility a coni (sintesi)
- modello deny-by-default
- regole con effetti `ALLOW` e `DENY`
- precedenza: `DENY` vince sempre
- policy storage unico su PostgreSQL
- cache compilata per utente/oggetto/versione policy
- audit obbligatorio su decisione finale

## 9) Scelte tecnologiche
- runtime: Node.js 22 LTS
- backend: NestJS + TypeScript
- frontend: React + Vite + Tailwind
- integrazione Salesforce: `jsforce`
- DB tecnico: PostgreSQL + Prisma

## 10) Qualita e operativita
- lint/build/test in CI su backend e frontend
- migrazioni Prisma gestite in pipeline (`migrate deploy`)
- metriche: latenza query, hit/miss cache, errori policy/auth
- runbook produzione per deploy, incident e rollback

## 11) Contratti applicativi rilevanti
Catalogo app admin:
- `GET /apps/admin` -> `{ items: [{ id, label, description?, sortOrder, entityCount, permissionCount, updatedAt }] }`
- `GET /apps/admin/:appId` -> `{ app: { id, label, description?, sortOrder, entityIds: string[] } }`
- `POST|PUT /apps/admin` -> `{ app: { id, label, description?, sortOrder?, entityIds: string[] } }`

Launcher utente:
- `GET /apps/available` -> `{ items: [{ id, label, description?, entities: [{ id, label, description?, basePath?, objectApiName }] }] }`
- il launcher non introduce un nuovo enforcement applicativo oltre ad ACL e visibility gia esistenti
- la selezione dell app resta un contesto UI persistito per utente nel browser

ACL admin permission:
- mutation permission -> `{ permission: { code, label?, description?, aliases? }, appIds: string[] }`
- detail permission -> `appIds[]` e `appCount`

## 12) Confini e non-obiettivi
- Salesforce resta system of record business
- PostgreSQL non sostituisce Salesforce sui dati dominio, ma governa policy/cache/audit visibility
- il frontend non applica regole di sicurezza definitive: enforcement finale solo backend

## 13) Roadmap adozione
- Fase A: foundation (monorepo, auth, connector)
- Fase B: ACL e navigazione
- Fase C: entities/query config-driven
- Fase D: visibility engine + audit + policy repository PostgreSQL
- Fase E: hardening, performance, runbook

## 14) Documenti correlati
- `docs/security-model.md`
- `docs/acl-resources-map.md`
- `docs/entity-config-guide.md`
- `docs/query-template-guide.md`
- `docs/visibility-cones-guide.md`
- `docs/prisma-postgres-guide.md`
- `docs/runbook-production.md`
