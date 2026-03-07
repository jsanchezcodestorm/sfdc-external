# Query Template Guide

## 1) Scopo
Questo documento definisce il contratto tecnico dei query template del modulo Query Engine.

Obiettivi:
- standardizzare come persistire e governare template SOQL riusabili
- chiarire il runtime realmente implementato nel progetto
- confermare che ACL e PostgreSQL sono le uniche sorgenti runtime

Ambito:
- tabella PostgreSQL `query_templates`
- endpoint runtime `POST /query/template/:templateId`
- endpoint admin `GET|PUT|DELETE /query/admin/templates*`

## 2) Fonte di verita e runtime
Fonte di verita:
- PostgreSQL, tabella `query_templates`

Comportamento runtime (`QueryTemplateRepository`):
- carica i template on-demand da PostgreSQL
- applica cache in-memory per `templateId` con deduplica dei load concorrenti
- se il template non esiste: `404`
- se il payload persistito e invalido rispetto al contratto runtime: `400`

Regole operative:
- nessun fallback su file legacy o path runtime alternativi
- nessun watcher file-based
- ogni modifica runtime passa dagli endpoint admin o da migration Prisma

## 3) Contratto runtime effettivo
Ogni template supporta questi campi:
- `id` (required): identificatore tecnico kebab-case
- `objectApiName` (required)
- `description` (optional)
- `soql` (required)
- `defaultParams` (optional): record di valori scalar `string | number | boolean`
- `maxLimit` (optional): intero positivo

Esempio:
```json
{
  "id": "account-pipeline",
  "objectApiName": "Account",
  "description": "Pipeline account",
  "soql": "SELECT Id, Name FROM Account WHERE Industry = {{industry}} LIMIT {{limit}}",
  "defaultParams": {
    "industry": "Technology",
    "limit": 50
  },
  "maxLimit": 200
}
```

Nota importante:
- il runtime attuale implementa solo template SOQL parametrizzati
- il DSL storico documentato in versioni precedenti non e parte del contratto runtime corrente

## 4) Placeholder e serializzazione
Sintassi supportata:
- `{{paramName}}`

Risoluzione runtime:
- i parametri request sovrascrivono `defaultParams`
- placeholder mancante => `400`
- token che contiene `limit` => validato come intero `1..maxLimit` (default server `200`)

Serializzazione:
- `string` -> quotata con escape SOQL
- `number` -> numero
- `boolean` -> `TRUE` / `FALSE`

## 5) ACL come sorgente unica
Controllo accesso template:
1. verifica ACL risorsa `query:<templateId>`
2. se ACL concede, il backend valuta la visibility sull`objectApiName`
3. se ACL o visibility negano, la request termina in `403`

Regole:
- i query template non contengono una policy autorizzativa propria
- la risorsa ACL `query:<templateId>` va gestita nel modulo admin ACL o via migration
- la UI admin dei template puo segnalare una risorsa ACL mancante, ma non la crea automaticamente
- ogni esecuzione runtime produce anche un evento nel nuovo stream audit `query`
- lo stream `query` salva il SOQL finale gia risolto e scoped, oltre a `baseWhere`/`finalWhere`, stato, contatori e metadati del template

## 6) Endpoint admin
Endpoint disponibili:
- `GET /query/admin/templates`
- `GET /query/admin/templates/:templateId`
- `PUT /query/admin/templates/:templateId`
- `DELETE /query/admin/templates/:templateId`

Vincoli admin:
- `templateId` route e `body.id` devono coincidere
- `defaultParams` accetta solo valori scalar
- `maxLimit` deve essere un intero positivo

## 7) Checklist operativa
Per aggiungere un nuovo template:
1. inserire il record in `query_templates` via UI admin o migration Prisma
2. aggiungere la risorsa ACL `query:<templateId>` nello snapshot ACL PostgreSQL
3. verificare `POST /query/template/:templateId` con un utente autorizzato
4. verificare il caso deny con ACL mancante o permessi insufficienti

## 8) Errori attesi
- `400`: payload admin invalido, placeholder mancante, `limit` non valido
- `403`: ACL o visibility negano l accesso
- `404`: template non trovato

## 9) Audit runtime query
Per `POST /query/template/:templateId` il backend registra:
- stream `visibility`: decisione finale ALLOW/DENY con reason code
- stream `query`: esecuzione della query risolta con SOQL completo, `templateId`, parametri, campi selezionati, row count, durata e stato finale

Regole operative:
- l evento `query` viene creato solo dopo la compilazione/scoping finale del SOQL
- errori di input o compilazione prima del SOQL finale non generano un evento `query`
- in caso di failure Salesforce dopo un ALLOW visibility, restano tracciati sia `visibility` sia `query`
