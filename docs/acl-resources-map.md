# ACL Operational Guide

## 1) Scopo
Questo documento definisce come progettare, implementare e governare ACL nel progetto.

Obiettivi:
- rendere PostgreSQL l unica sorgente di verita per permission catalog, snapshot legacy dei default permissions e risorse
- rendere PostgreSQL la sorgente di verita anche per le assegnazioni permission -> Contact
- rendere PostgreSQL la sorgente di verita anche per il mapping permission -> app disponibili
- mantenere enforcement backend fail-closed
- dare una mappa operativa dei resource id usati dall applicazione

## 2) Fonte di verita e runtime
Fonte di verita ACL:
- PostgreSQL, tramite lo snapshot caricato da `AclConfigRepository`

Comportamento runtime (`AclService`):
- bootstrap da PostgreSQL in `onModuleInit`
- cache in-memory del catalogo ACL
- alias permessi normalizzati lato runtime
- nessun fallback built-in o file-based
- configurazione ACL invalida => bootstrap fallisce
- risorsa mancante => accesso negato
- `accessMode: disabled` => accesso negato
- `syncState: stale` => accesso negato
- `accessMode: authenticated` => accesso consentito a ogni sessione autenticata
- `accessMode: permission-bound` => accesso consentito solo con almeno una permission effettiva associata alla risorsa
- le permission effettive runtime derivano dalle assegnazioni ACL esplicite del Contact; `defaultPermissions` non e piu una baseline runtime operativa

Gestione amministrativa:
- `GET /acl/admin/config`
- `PUT /acl/admin/config`
- `POST /acl/admin/resources/sync`
- `GET /acl/admin/contact-permissions`
- `GET /acl/admin/contact-permissions/:contactId`
- `PUT /acl/admin/contact-permissions/:contactId`
- `DELETE /acl/admin/contact-permissions/:contactId`
- `GET /acl/admin/contact-suggestions`
- `GET /apps/admin`
- `GET /apps/admin/:appId`
- `GET /apps/admin/:appId/dashboard-options`
- `POST /apps/admin`
- `PUT /apps/admin/:appId`
- `PUT /apps/admin/:appId/home`
- `DELETE /apps/admin/:appId`

Il `PUT` sostituisce in modo atomico l intero snapshot:
```json
{
  "permissions": [],
  "defaultPermissions": [],
  "resources": []
}
```

Nota operativa:
- le risorse `managedBy: system` vengono riallineate automaticamente al boot backend e dopo mutate rilevanti
- il catalogo system copre discovery di `rest:*`, route note di shell (`route:*`), `entity:*` e `query:*`
- le risorse manuali restano supportate per casi custom, ma non possono riusare un id riservato alla discovery

## 3) Modello ACL
Permission catalog:
- `code` canonico, es. `PORTAL_ADMIN`
- `label` e `description` opzionali
- `aliases[]` opzionali, univoci globalmente

Default permissions:
- elenco legacy ordinato di codici permission mantenuto per compatibilita snapshot e metadata
- il target operativo e mantenerlo vuoto
- non viene applicato come baseline implicita alle nuove sessioni o ai check ACL `permission-bound`

Direct contact permissions:
- codici permission espliciti assegnati a uno specifico `Contact`
- costituiscono la fonte primaria del set ACL effettivo del Contact
- diventano effettivi dalla request autenticata successiva

Permission -> app assignments:
- ogni permission puo pubblicare zero o piu app nel launcher frontend
- il mapping e gestito nel contratto admin delle permission tramite `appIds`
- `GET /apps/available` restituisce solo le app raggiunte da almeno una permission effettiva dell utente
- per ogni app, il backend include solo gli item runtime autorizzati
- gli item con `resourceId` richiedono una risorsa ACL esistente e almeno una permission che la pubblichi
- gli item `entity` richiedono anche il controllo ACL `entity:<entityId>`
- la `home` dell app non ha un gate ACL aggiuntivo oltre alla pubblicazione dell app stessa
- un app viene restituita se ha la `home` accessibile o almeno un altro item accessibile

Resource types supportati:
- `rest`
- `entity`
- `query`
- `route`

Contratto risorsa ACL:
- `id`
- `type`
- `accessMode`: `disabled | authenticated | permission-bound`
- `managedBy`: `manual | system`
- `syncState`: `present | stale`
- `sourceType?`: `rest | route | entity | query`
- `sourceRef?`: riferimento tecnico della sorgente scoperta
- `target?`
- `description?`
- `permissions[]`

Semantica:
- `permissions: []` non implica piu allow implicito; il comportamento dipende da `accessMode`
- durante la migrazione iniziale, le risorse legacy senza permission vengono portate a `accessMode: authenticated` per preservare il comportamento preesistente
- associare una permission a una risorsa `disabled` la promuove a `permission-bound`
- una risorsa `permission-bound` senza permission effettive esplicite compatibili risponde `DENY`

## 4) Convenzioni ID risorse
Pattern obbligatori:
- `rest:<feature-id>`
- `entity:<entity-id>`
- `query:<template-id>`
- `route:<route-id>`

Regole:
- il suffisso deve essere lowercase kebab-case
- il prefisso deve combaciare con il `type`
- risorsa mancante => accesso negato
- gli id scoperti automaticamente sono riservati al sistema

## 5) Mappa capability -> resource id
REST:
- `rest:navigation-read`
- `rest:global-search`
- `rest:entities-read`
- `rest:entities-write`
- `rest:apps-read`
- `rest:apps-admin`
- `rest:auth-admin`
- `rest:entities-config-admin`
- `rest:query-execute`
- `rest:query-template-admin`
- `rest:acl-config-admin`
- `rest:audit-read`
- `rest:dashboards-read`
- `rest:dashboards-write`
- `rest:reports-read`
- `rest:reports-write`
- `rest:salesforce-objects`
- `rest:salesforce-raw-query`
- `rest:visibility-admin`
- `rest:metadata-admin`

ENTITY:
- `entity:account`
- `entity:opportunity`

QUERY:
- `query:account-pipeline`

ROUTE scoperte automaticamente dal catalogo condiviso shell:
- `route:home`
- `route:admin-auth`
- `route:admin-apps`
- `route:admin-visibility`
- `route:admin-metadata`
- `route:admin-entity-config`
- `route:admin-acl`
- `route:admin-query-templates`
- `route:admin-audit`

ROUTE manuali supportate:
- restano consentite per casi custom non presenti nel catalogo condiviso, ad esempio item applicativi o pagine bespoke
- esempio possibile: `route:sales-kpi`

## 6) Flusso autorizzativo
Ordine obbligatorio:
1. autenticazione sessione
2. validazione input
3. check ACL sulla risorsa
4. se necessario, visibility row/field-level

Regole:
- ACL decide la capability
- visibility decide il perimetro dati
- i query template usano solo `query:<templateId>` come sorgente autorizzativa
- il frontend consuma `GET /navigation` come source of truth per le `route:*` consentite
- `NavigationService` usa il catalogo route condiviso per path/label/ordine e l ACL solo per filtrare gli id consentiti

## 7) Checklist operativa
Per aggiungere una capability nuova:
1. se la capability nasce da controller/entity/query/route shell, allineare il codice sorgente e lasciare che il sync generi o riallinei la risorsa
2. se la capability e custom/manuale, creare o aggiornare il relativo record ACL in PostgreSQL evitando collisioni con id riservati
3. assegnare `accessMode` corretto (`disabled`, `authenticated`, `permission-bound`)
4. verificare scenario allow/deny e, per risorse system, lo stato `present` dopo sync
5. aggiornare la documentazione tecnica correlata

## 8) Anti-pattern da evitare
- controllo ACL solo lato frontend
- fallback a file legacy ACL
- risorse mancanti “temporaneamente” in produzione
- metadata esterni che bypassano la decisione ACL
- usare `defaultPermissions` come sostituto di un assegnamento esplicito al Contact
