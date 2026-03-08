# ACL Operational Guide

## 1) Scopo
Questo documento definisce come progettare, implementare e governare ACL nel progetto.

Obiettivi:
- rendere PostgreSQL l unica sorgente di verita per permission catalog, default permissions e risorse
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

Gestione amministrativa:
- `GET /acl/admin/config`
- `PUT /acl/admin/config`
- `GET /acl/admin/contact-permissions`
- `GET /acl/admin/contact-permissions/:contactId`
- `PUT /acl/admin/contact-permissions/:contactId`
- `DELETE /acl/admin/contact-permissions/:contactId`
- `GET /acl/admin/contact-suggestions`
- `GET /apps/admin`
- `GET /apps/admin/:appId`
- `POST /apps/admin`
- `PUT /apps/admin/:appId`
- `DELETE /apps/admin/:appId`

Il `PUT` sostituisce in modo atomico l intero snapshot:
```json
{
  "permissions": [],
  "defaultPermissions": [],
  "resources": []
}
```

## 3) Modello ACL
Permission catalog:
- `code` canonico, es. `PORTAL_ADMIN`
- `label` e `description` opzionali
- `aliases[]` opzionali, univoci globalmente

Default permissions:
- elenco ordinato di codici permission assegnati a tutti gli utenti al login

Direct contact permissions:
- codici permission espliciti assegnati a uno specifico `Contact`
- si combinano in modo additivo con i default permissions
- diventano effettivi dalla request autenticata successiva

Permission -> app assignments:
- ogni permission puo pubblicare zero o piu app nel launcher frontend
- il mapping e gestito nel contratto admin delle permission tramite `appIds`
- `GET /apps/available` restituisce solo le app raggiunte da almeno una permission effettiva dell utente
- per ogni app, il backend include solo le entity che passano il controllo ACL `entity:<entityId>`
- un app senza entity visibili non viene restituita al frontend

Resource types supportati:
- `rest`
- `entity`
- `query`
- `route`

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

## 5) Mappa capability -> resource id
REST:
- `rest:navigation-read`
- `rest:global-search`
- `rest:entities-read`
- `rest:entities-write`
- `rest:apps-read`
- `rest:apps-admin`
- `rest:entities-config-admin`
- `rest:query-execute`
- `rest:query-template-admin`
- `rest:acl-config-admin`
- `rest:audit-read`
- `rest:salesforce-objects`
- `rest:salesforce-raw-query`
- `rest:visibility-admin`

ENTITY:
- `entity:account`
- `entity:opportunity`

QUERY:
- `query:account-pipeline`

ROUTE:
- `route:home`
- `route:operations-pipeline`
- `route:admin-apps`
- `route:admin-visibility`
- `route:admin-entity-config`
- `route:admin-acl`
- `route:admin-query-templates`
- `route:admin-audit`

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

## 7) Checklist operativa
Per aggiungere una capability nuova:
1. creare o aggiornare il relativo record nello snapshot ACL PostgreSQL
2. allineare backend e frontend al nuovo `resource id`
3. verificare scenario allow/deny
4. aggiornare la documentazione tecnica correlata

## 8) Anti-pattern da evitare
- controllo ACL solo lato frontend
- fallback a file legacy ACL
- risorse mancanti “temporaneamente” in produzione
- metadata esterni che bypassano la decisione ACL
