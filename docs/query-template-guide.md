# Query Template Guide

## 1) Scopo
Questo documento definisce il contratto tecnico dei query template del modulo Query Engine.

Obiettivi:
- standardizzare come definire template SOQL/DSL in JSON
- chiarire il comportamento runtime reale del backend
- evidenziare limiti e ambiguita da gestire in un progetto nuovo da zero

Ambito:
- `backend/config/queries/templates/*.json`
- `POST /query` con `kind: "template"`

Fuori ambito:
- configurazione `entities/*` (vedi `docs/entity-config-guide.md`)
- policy visibility a coni

## 2) Dove vivono i template
Path risolto a runtime (`QueryConfigService`):
- `config/queries` se presente nella root runtime
- fallback `backend/config/queries`

Cartella template:
- `.../queries/templates/*.json`

Formati file accettati per ogni file JSON:
1. array di template
2. oggetto `{ "templates": [...] }`
3. oggetto singolo template con `id`

Regole loader:
- in ambiente non `production` e attivo il watcher e hot reload (debounce ~50ms)
- `id` duplicato: viene mantenuto il primo, i successivi sono ignorati
- template non normalizzabile: viene ignorato con warning
- se un file template e invalido/non parsabile, il loader considera la config non valida e applica fallback globale a lista vuota

Impatto operativo:
- un solo file corrotto puo rendere indisponibili tutti i query template finche non viene corretto.

## 3) Modello JSON ufficiale
Ogni template supporta:
- `id` (required)
- `description` (optional)
- `type`: `"template"` o `"soql"` (required de facto)
- `entity` (required per `type: template`)
- `query` (required per `type: template`)
- `soql` (required per `type: soql`)
- `parameters` (optional)
- `permissions` (optional)
- `ui` (optional metadata)
- `options` (optional)

Inferenza type:
- se `type` manca e `soql` esiste -> trattato come `soql`
- altrimenti -> trattato come `template`

## 4) DSL v1 (`type: template`)
### 4.1 Struttura minima
```json
{
  "id": "sales-opportunities-pipeline-by-stage",
  "type": "template",
  "entity": "Opportunity",
  "query": {
    "select": ["Id", "Name", "StageName"],
    "where": [
      { "field": "IsClosed", "operator": "=", "value": false },
      { "field": "CloseDate", "operator": ">=", "param": "startDate" },
      { "field": "CloseDate", "operator": "<=", "param": "endDate", "optional": true }
    ],
    "orderBy": [
      { "field": "StageName", "direction": "ASC" }
    ],
    "limit": 2000
  }
}
```

### 4.2 Campi `query`
- `select` (required, almeno 1 campo)
- `where` (optional): array di condizioni
- `orderBy` (optional)
- `limit` (optional, usato solo se > 0)

### 4.3 Forme ammesse in `where`
Una entry `where[]` puo essere:
1. stringa raw (inserita nella WHERE, con placeholder replacement)
2. oggetto con `raw`
3. oggetto strutturato:
   - `field` (required)
   - `operator` (optional, default `=`)
   - `param` (optional)
   - `value` (optional)
   - `optional` (optional)

Risoluzione priorita valore:
1. `param` se presente e valorizzato
2. `value` statico
3. nessun valore -> genera `field operator` (caso da evitare)

### 4.4 Operatori
Stato attuale runtime:
- nessuna whitelist hard-enforced degli operatori
- `operator` e passato direttamente in output SOQL

Conseguenza:
- la governance operatori e demandata a review/config policy, non al parser.

### 4.5 Placeholder
Sostituzione placeholder: `{{paramName}}`

Nei template DSL:
- supportati in `where` string/raw
- non supportano fallback `||`

Nei template `type: soql`:
- placeholder sostituiti su tutto il testo SOQL
- placeholder mancanti -> errore `Missing parameters...`

## 5) Parametri (`parameters`)
Contratto parametro:
- `label` (metadata)
- `type`: `string | number | boolean | date | datetime | picklist`
- `multi` (array mode)
- `required` (metadata)
- `default`
- `source` (metadata, tipicamente picklist source)

Coercion runtime:
- `number`: prova parse numerico
- `boolean`: parse string `true/false`
- `date`: formato `YYYY-MM-DD` o string trim
- `datetime`: ISO UTC se input e `Date`
- `multi: true`: sempre lista valori, render come `v1, v2, ...`

Formattazione SOQL:
- `null` -> `NULL`
- `boolean` -> `TRUE`/`FALSE`
- `number` -> numero
- `string` -> quotata con escape (`'value'`)
- `date/datetime` tipizzati -> render non quotato

Nota critica:
- `parameters.required` non viene enforce automaticamente dal backend.
- un parametro diventa realmente obbligatorio se e usato in una condizione non `optional` o tramite `options.requireAnyOf`.

## 6) Modalita legacy `type: soql`
Esempio:
```json
{
  "id": "contracts-expired-no-active",
  "type": "soql",
  "soql": "SELECT Id, Name FROM Contact WHERE Id IN (SELECT Resource__c FROM Contract_Resource__c WHERE End_Date__c < {{referenceDate}})",
  "parameters": {
    "referenceDate": { "label": "Data", "type": "date", "required": true }
  }
}
```

Quando usarla:
- query complesse con subquery/statement non pratici in DSL strutturata

Tradeoff:
- maggiore flessibilita
- minore controllabilita rispetto al DSL strutturato

## 7) `permissions` e ACL: logica effettiva
Controllo accesso template (`QueryService.assertTemplateAccess`):
1. verifica ACL risorsa `query:<templateId>`
2. se ACL concede, accesso consentito
3. se ACL nega, fallback su `template.permissions.roles`
4. se nessun ruolo richiesto, accesso negato (`403`)

Implicazioni:
- ACL e la prima linea di controllo
- `permissions.roles` puo fungere da fallback

`permissions.fields`:
- viene normalizzato (`resolvedFields`) ma non e applicato come filtro campo server-side nella risposta
- quindi e metadata, non enforcement effettivo.

## 8) `options` supportate
Campi:
- `autoFetch`
- `maxFetch`
- `cacheTtl` (secondi)
- `requireAnyOf` (almeno uno tra i parametri indicati deve essere valorizzato)

Comportamento:
- `autoFetch` e `maxFetch` sono passati alle opzioni query Salesforce
- `cacheTtl` abilita cache file-based lato backend
- `requireAnyOf` e enforce con `400` se nessun parametro richiesto e presente

## 9) Cache template
Storage:
- `backend/cache/query-templates` (o `cache/query-templates` se cwd e `backend`)

Chiave cache include:
- `templateId`
- `parameters`
- `pageSize`
- `permissions` utente (ordinate)

Regole:
- cache usata solo su prima query (non su `next`)
- `cacheTtl <= 0` o assente -> cache disabilitata
- cleanup periodico ~5 minuti + cleanup lazy su read

Ambiguita importante:
- cache key non include versione template/config
- se cambi la definizione di un template, risultati cache gia salvati possono restare validi fino a TTL.

## 10) Contratto API `POST /query` (template)
Request minima:
```json
{
  "kind": "template",
  "templateId": "admin-invoices",
  "parameters": {
    "dateIssueFrom": "2026-01-01",
    "dateIssueTo": "2026-01-31"
  },
  "pageSize": 500
}
```

Paginazione:
- se la risposta contiene `nextRecordsUrl`, inviare una nuova request con `next`
- con `next`, il backend usa `queryMore` e non rigenera il SOQL

Errori comuni:
- `400`: payload invalido, parametri mancanti, `requireAnyOf` non soddisfatto
- `403`: ACL/permissions non sufficienti
- `404`: template non trovato

## 11) Matrice copertura (Fase 1)
| Feature | Stato | Note |
| --- | --- | --- |
| `type: template` | Coperto | DSL strutturata select/where/orderBy/limit |
| `type: soql` | Coperto | Legacy raw SOQL con placeholder |
| Parametri tipizzati + coercion | Coperto | `string/number/boolean/date/datetime/picklist` |
| Parametri multi (`IN`) | Coperto | via `multi: true` + `param` |
| Condizioni opzionali (`optional`) | Coperto | skip condizione se parametro assente |
| Vincolo `requireAnyOf` | Coperto | enforce lato backend |
| ACL `query:<id>` | Coperto | enforcement primario |
| Fallback `permissions.roles` | Coperto | usato solo se ACL non concede |
| Filtro risposta per `permissions.fields` | Escluso | metadata, non enforcement |
| Validazione whitelist operatori | Escluso | operator pass-through |
| Registry API template (list/get) | Escluso | nessun endpoint pubblico dedicato |

## 12) Regole pratiche per nuovi template
1. Definire template in `backend/config/queries/templates/<domain>.json` con `id` univoco.
2. Usare `type: template` come default; usare `type: soql` solo se necessario.
3. Dichiarare tutti i parametri usati in `param` dentro `parameters`.
4. Per filtri opzionali combinabili, usare `optional: true` e `options.requireAnyOf` quando serve.
5. Aggiungere risorsa ACL `query:<templateId>` in `backend/config/acl/resources/query.json`.
6. Evitare `where` string/raw salvo casi eccezionali; preferire condizioni strutturate.
7. Impostare `cacheTtl` solo su query stabili e non sensibili a freshness immediata.
8. Testare sempre: ok path, 400 (parametro), 403 (ACL), 404 (id).

## 13) Ambiguita correnti e hardening raccomandato
Ambiguita de facto:
- `parameters.required` non enforce
- `permissions.fields` non enforce
- `ui.*` e `parameters.source` non usati dal backend per enforcement
- nessuna whitelist operatori
- una condizione con `param` non dichiarato puo degradare in SOQL invalida (`field operator`)
- un file JSON corrotto puo disabilitare tutti i template (fallback vuoto)

Hardening consigliato per progetto nuovo:
- validazione schema JSON in CI con regole forti (operatori, parametri dichiarati, no condizioni monche)
- lint custom: vietare `where` string/raw salvo allowlist
- enforcement esplicito di `required` lato backend
- enforcement reale `permissions.fields` o rimozione del campo per evitare falso senso di sicurezza
- invalidazione cache su reload config (version key o purge)

## 14) Checklist test minima
- [ ] template valido caricato e accessibile da ruolo autorizzato
- [ ] ruolo non autorizzato riceve `403`
- [ ] template inesistente restituisce `404`
- [ ] `requireAnyOf` non soddisfatto restituisce `400`
- [ ] parametro multi vuoto con condizione non optional genera errore atteso
- [ ] `next` funziona su paginazione
- [ ] cache TTL: hit prima della scadenza, miss dopo scadenza
- [ ] modifica template: verificare comportamento cache fino a scadenza TTL
