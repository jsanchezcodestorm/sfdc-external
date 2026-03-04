# ACL Operational Guide

## 1) Scopo
Questo documento definisce come progettare, implementare e governare ACL nel nuovo progetto.

Non e una fotografia dell'istanza attuale: e una guida operativa "to-be".

Obiettivi:
- standardizzare il modello permessi e risorse ACL
- rendere ogni endpoint/route protetta in modo deterministico
- evitare bypass e regressioni con checklist e test obbligatori

## 2) Principi architetturali ACL
- ACL decide "cosa posso usare" (capability-level)
- Visibility decide "quali dati vedo" (row/field-level)
- ACL e visibility sono complementari, non alternative
- enforcement definitivo solo backend
- default operativo: fail-closed

Regola fondamentale:
- risorsa ACL mancante => accesso negato

## 3) Fonte di verita e struttura file
Fonte di verita ACL:
- `backend/config/acl/permissions.json`
- `backend/config/acl/defaults.json`
- `backend/config/acl/resources/entity.json`
- `backend/config/acl/resources/query.json`
- `backend/config/acl/resources/rest.json`
- `backend/config/acl/resources/route.json`

Comportamento runtime (`AclService`):
- in dev: watch + reload automatico JSON
- in prod: no watch
- alias permessi normalizzati (case/spacing tolerant)
- file mancanti/non validi: fallback a config built-in

Regola operativa:
- non fare affidamento al fallback built-in in ambienti reali
- validare sempre config ACL in CI prima del deploy

## 4) Modello permessi (permission catalog)
### 4.1 Contratto
Ogni permesso ha:
- `code` (canonicale, es. `PORTAL_HR`)
- `label`
- `description` (raccomandata)
- `aliases` (raccomandati per retrocompatibilita dati esterni)

### 4.2 Regole di naming
- `code` in maiuscolo con `_`
- prefisso dominio consigliato (`PORTAL_`)
- no codici duplicati

### 4.3 Default permissions
`defaults.json` contiene i permessi assegnati quando il profilo utente non risolve alcun code valido.

Regola:
- mantenere i default minimali (least privilege)

## 5) Modello risorse ACL
Tipi supportati:
- `rest`: endpoint REST custom business
- `entity`: capability su entity engine (`entity:<id>`)
- `query`: capability su query template (`query:<templateId>`)
- `route`: capability UI/navigation

## 6) Convenzioni ID risorse
Pattern obbligatori:
- `rest:<feature-id>`
- `entity:<entity-id>`
- `query:<template-id>`
- `route:<route-id>`

Regole:
- `feature-id`/`entity-id`/`template-id`/`route-id` in lowercase kebab-case
- una risorsa = una capability
- no riuso ambiguo dello stesso ID per scope diversi

## 7) Contratto JSON risorsa
Esempio base:
```json
{
  "id": "query:projects-by-year",
  "type": "query",
  "target": "/operations/projects",
  "description": "Elenco commesse per intervallo",
  "permissions": ["PORTAL_OPERATIONS", "PORTAL_ADMIN"]
}
```

Campi:
- `id` (required)
- `type` (raccomandato)
- `target` (raccomandato, tracciabilita)
- `description` (raccomandato)
- `permissions` (required di fatto)

Nota runtime:
- `permissions: []` rende la risorsa accessibile a chiunque autenticato
- usare array vuoto solo per capability esplicitamente pubbliche

## 8) Matrice operativa capability -> risorsa
| Capability | Tipo risorsa ACL | ID consigliato |
| --- | --- | --- |
| Endpoint controller custom | `rest` | `rest:<feature-id>` |
| Entity list/detail/form/related | `entity` | `entity:<entity-id>` |
| Query template (`POST /query` kind template) | `query` | `query:<template-id>` |
| Pagina/route frontend protetta | `route` | `route:<route-id>` |

## 9) Flusso decisionale autorizzazione
Ordine obbligatorio richiesta protetta:
1. autenticazione sessione
2. validazione input
3. check ACL risorsa
4. se endpoint dati: applicazione visibility policy

Esito ACL:
- risorsa inesistente -> deny
- risorsa con permessi e match almeno uno -> allow
- risorsa con permessi e nessun match -> deny

Regola esplicita per query template:
- `query:<template-id>` e l unica sorgente autorizzativa (`MUST`)
- metadata template (`permissions.roles`, `permissions.fields`) non possono fare override della decisione ACL (`MUST NOT`)
- se ACL nega, la richiesta termina in deny (`403`) senza fallback autorizzativi

## 10) Procedura operativa per nuova capability
1. definire capability e perimetro (rest/entity/query/route)
2. scegliere `resource id` conforme convenzioni
3. aggiornare file risorse ACL corretto
4. aggiornare (se necessario) `permissions.json` e `defaults.json`
5. applicare controllo ACL nel backend (guard/service check)
6. allineare frontend navigation/route gating
7. aggiungere test allow/deny
8. aggiornare documentazione tecnica correlata

## 11) Templates pronti (copy/paste)
### 11.1 Nuova risorsa REST
```json
{
  "id": "rest:hr-export-report",
  "type": "rest",
  "target": "/hr/export-report",
  "description": "Export report HR",
  "permissions": ["PORTAL_HR", "PORTAL_ADMIN"]
}
```

### 11.2 Nuova risorsa ENTITY
```json
{
  "id": "entity:project",
  "type": "entity",
  "target": "/operations/project",
  "description": "Accesso entity Project",
  "permissions": ["PORTAL_OPERATIONS", "PORTAL_ADMIN"]
}
```

### 11.3 Nuova risorsa QUERY
```json
{
  "id": "query:projects-by-year",
  "type": "query",
  "target": "/operations/projects",
  "description": "Query commesse per anno",
  "permissions": ["PORTAL_OPERATIONS", "PORTAL_ADMIN"]
}
```

### 11.4 Nuova risorsa ROUTE
```json
{
  "id": "route:operations-projects",
  "type": "route",
  "target": "/operations/projects",
  "description": "Pagina operations projects",
  "permissions": ["PORTAL_OPERATIONS", "PORTAL_ADMIN"]
}
```

## 12) Test matrix ACL obbligatoria
| ID | Scenario | Esito atteso |
| --- | --- | --- |
| `ACL-01` | Utente non autenticato su endpoint protetto | `401` |
| `ACL-02` | Utente autenticato con permesso richiesto | `200/2xx` |
| `ACL-03` | Utente autenticato senza permesso richiesto | `403` |
| `ACL-04` | Risorsa ACL non registrata | `403` fail-closed |
| `ACL-05` | Alias permesso valido in input utente | accesso coerente |
| `ACL-06` | Permission code sconosciuto in input utente | ignorato + fallback/default coerente |
| `ACL-07` | Risorsa con `permissions: []` | accessibile solo se esplicitamente previsto |
| `ACL-08` | Endpoint dati autorizzato ACL ma non visibility | deny in step visibility |

Gate minimo PR:
- nessun test `ACL-01..ACL-08` fallito

## 13) Governance e change management
### 13.1 Regole PR
- ogni nuova capability deve includere update ACL
- nessuna route/endoint protetta senza `resource id`
- ogni modifica permessi deve avere motivazione funzionale

### 13.2 Versioning
- ACL config e versionata in Git
- ogni release include diff ACL nelle release notes

### 13.3 Review checklist
- coerenza naming ID
- least privilege rispettato
- no broad grant non motivati
- allineamento backend + frontend
- test allow/deny presenti

## 14) Anti-pattern da evitare
- controllo ACL solo lato frontend
- risorse mancanti “temporaneamente” in produzione
- wildcard logici non tracciabili nei permessi
- usare `PORTAL_ADMIN` come scorciatoia per feature non classificate
- duplicare stessa capability su piu resource id ambigui
- fallback autorizzativo da metadata esterni alla ACL (es. `template.permissions.roles`)

## 15) Osservabilita minima ACL
Log e metriche consigliate:
- conteggio `403` per `resource id`
- risorse mancanti richieste (warning deduplicato)
- trend access denied per permesso
- audit richiesta: `request_id`, `resource_id`, `decision`

## 16) Criteri di accettazione
Il modello ACL e accettato quando:
- tutte le capability protette hanno risorsa ACL esplicita
- nessuna risorsa mancante in runtime critico
- test matrix ACL verde
- separazione ACL/visibility applicata in tutti i flussi dati
- documentazione ACL aggiornata e allineata alle configurazioni

## 17) Documenti correlati
- `docs/architecture-overview.md`
- `docs/security-model.md`
- `docs/entity-config-guide.md`
- `docs/query-template-guide.md`
- `docs/visibility-cones-guide.md`
- `docs/runbook-production.md`
