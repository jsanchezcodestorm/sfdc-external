# Entity Config Guide

## 1) Scopo
Questo documento definisce il contratto tecnico delle configurazioni entita (`Entity Config`) usate dal backend per:
- listing (`list`)
- dettaglio (`detail`)
- form create/edit (`form`)
- related lists

Obiettivo: permettere un progetto nuovo da zero con configurazione JSON versionata, senza hardcode diffuso.

## 2) Fonte di verita e runtime
Fonte di verita:
- `config/entities` (se presente nella root runtime)
- fallback: `backend/config/entities`

Comportamento runtime (`EntitiesService`):
- carica tutte le cartelle entita all'avvio
- in ambiente non `production` attiva file watcher ricorsivo e ricarica automatica con debounce (~100ms)
- se un file JSON e invalido, logga errore e salta il file (fail-soft)
- se `base.json` manca, la cartella viene ignorata

Nota operativa:
- la validazione campi Salesforce e lazy: avviene alla prima richiesta runtime dell'entita (`getValidatedEntityConfigOrThrow`), non al bootstrap.

## 3) Struttura directory obbligatoria
```text
backend/config/entities/<entity-id>/
  base.json
  list/
    index.json
    views/*.json
  detail/
    index.json
    sections/*.json
    related-lists/*.json
  form/
    index.json
    sections/*.json
```

Regole:
- `<entity-id>` SHOULD coincidere con `base.json.id`
- `list`, `detail`, `form` sono opzionali
- i manifest (`index.json`) referenziano file figli tramite path relativi alla rispettiva cartella

## 4) Contratto `base.json`
Campi:
- `id` (required): identificatore tecnico entita
- `label` (required): label UI
- `description` (optional)
- `navigation.basePath` (optional ma raccomandato): path base frontend (es. `/sales/opportunity`)

Esempio:
```json
{
  "id": "opportunity",
  "label": "Opportunita",
  "description": "Gestione opportunita Salesforce.",
  "navigation": {
    "basePath": "/sales/opportunity"
  }
}
```

## 5) Contratto `list`
### 5.1 Manifest `list/index.json`
Campi principali:
- `title` (required)
- `subtitle` (optional)
- `primaryAction` (optional)
- `views` (required): array string con file path vista, es. `"views/all.json"`

Se una view referenziata non esiste o non e JSON valido:
- warning su log
- view ignorata

### 5.2 View `list/views/*.json`
Campi principali:
- `id`, `label`, `query`, `columns` (required)
- `description`, `default`, `pageSize`, `search`, `primaryAction`, `rowActions` (optional)

Selezione vista runtime:
1. `viewId` richiesto e trovato
2. prima vista con `default: true`
3. prima vista dell'array

### 5.3 `search` (lista)
Contratto:
- `search.fields`: array field path
- `search.minLength`: default `2`

Comportamento backend:
- se termine troppo corto: nessun filtro search aggiunto
- se `query.object` e risolvibile: search type-aware via describe Salesforce
- campi non `filterable` vengono esclusi
- tipi testuali -> `LIKE '%term%'`
- tipi numerici -> confronto `=` su numero parsato
- boolean -> confronto `= true|false` solo con input `true`/`false`

Nota:
- `pageSize` e clampato lato API nel range `1..2000`.

## 6) Contratto `detail`
### 6.1 Manifest `detail/index.json`
Campi principali:
- `query` (required)
- `sections` (required in pratica UI): array path verso `detail/sections/*.json`
- `relatedLists` (optional): array path verso `detail/related-lists/*.json`
- `titleTemplate`, `fallbackTitle`, `subtitle`, `actions`, `pathStatus` (optional)

### 6.2 Sezioni `detail/sections/*.json`
Struttura:
- `title`, `fields[]`
- ogni field puo avere `label` + (`field` oppure `template`)
- supportati `highlight` e `format` (`date` | `datetime`)

### 6.3 Related lists `detail/related-lists/*.json`
Campi principali:
- `id`, `label`, `query`, `columns` (required)
- `description`, `actions`, `rowActions`, `emptyState`, `pageSize` (optional)

Per la query related list, usare tipicamente `{{id}}` come filtro record padre.

### 6.4 `pathStatus`
Contratto:
- `field` (required)
- `steps[]` con `value` (required) e `label` (optional)
- `allowUpdate` (optional, default effettivo frontend `true`)

Vincolo importante:
- aggiornamento stato supportato solo su field diretto (no path con `.`).

## 7) Contratto `form`
### 7.1 Manifest `form/index.json`
Campi:
- `title.create`, `title.edit` (required)
- `query` (required)
- `sections` (required in pratica UI): array path verso `form/sections/*.json`
- `subtitle` (optional)

### 7.2 Sezioni `form/sections/*.json`
Ogni field:
- `label`, `field`, `inputType` (required)
- `inputType` ammessi: `text | email | tel | date | textarea`
- `required`, `placeholder`, `lookup` (optional)

### 7.3 `lookup` (metadata form)
Contratto:
- `searchField` (optional, default lookup service: `Name`)
- `where[]` (optional): condizioni addizionali
- `orderBy[]` (optional)
- `prefill` (optional)

Semantica operativa (frontend):
- le condizioni `where[].value` string supportano template `{{...}}`
- se una condizione non si risolve (placeholder vuoto), viene scartata
- se `parentRel` non combacia col contesto (`?parentRel=...`), la condizione viene scartata
- `prefill: true` prova a valorizzare automaticamente il lookup nel create usando i filtri

## 8) Query DSL supportata (`EntityQueryConfig`)
Contratto query:
- `object` (required)
- `fields[]` (required, ma se vuoto il builder usa `Id`)
- `where[]` (optional)
- `orderBy[]` (optional)
- `limit` (optional)

`where[]` supporta due forme:
1. string raw (inserita cosi come in SOQL)
2. object:
   - `raw` (precedenza massima)
   - oppure `field` + `operator` (default `=`) + `value`

`value` puo essere:
- scalar: string | number | boolean | null
- array: genera `(<v1>, <v2>, ...)`

Template placeholders:
- sintassi: `{{key}}`
- escape literal automatico lato backend su sostituzione template
- se la key non e in context, placeholder -> stringa vuota

Esempio query detail:
```json
{
  "object": "Opportunity",
  "fields": ["Id", "Name", "StageName"],
  "where": [
    { "field": "Id", "operator": "=", "value": "{{id}}" }
  ],
  "limit": 1
}
```

## 9) Placeholder e template: regole e ambiguita
Supporto certo:
- backend query resolver: `{{key}}`
- frontend renderer (title/column/template/action target): `{{field}}` e fallback `{{A || B}}`

Ambiguita da evitare:
- fallback `||` NON e supportato nella sostituzione template backend per SOQL
- quindi nelle query usare solo placeholder semplici (`{{id}}`, `{{parentId}}`, ecc.)

Regola pratica:
- usare `||` solo in template destinati alla renderizzazione UI, non in query SOQL.

## 10) Validazioni runtime automatiche
La validazione entita verifica (on-demand):
- `query.fields`, `query.where`, `query.orderBy`
- campi usati in `columns.field` e template colonna
- campi usati in `detail.sections` (`field`/template)
- `detail.pathStatus.field`
- campi usati in `actions.target` (placeholder)
- campi in `search.fields`
- field form (`form.sections[].fields[].field`)
- path relazionali multi-segmento (`Account.Name`, `Owner.Name`, `__r`, `...Id`)

Errori tipici:
- campo inesistente -> `422 UnprocessableEntity`
- entita non trovata -> `404`
- query/form non configurati su endpoint relativo -> `404`

## 11) Salvataggio form: regole server-side
Durante create/update:
- il backend salva solo field presenti nella configurazione form (piu eventuale `pathStatus.field`)
- field relazionali (`A.B`) non sono salvabili direttamente
- field non createable/updateable su Salesforce vengono ignorati
- valori normalizzati per tipo (`boolean`, numerici, `date`, `datetime`, `picklist`, `multipicklist`)
- se payload finale non contiene campi validi -> `400`

Conseguenza:
- la form config definisce esplicitamente il perimetro di scrittura consentito.

## 12) Convenzioni raccomandate
- mantenere `id cartella == base.id`
- in `query.fields` includere sempre `Id` nelle viste tabellari e dettaglio
- evitare `where` string raw se non strettamente necessario; preferire condizioni object
- per azioni `link`, usare target relativi e placeholder espliciti (`view/{{Id}}`)
- usare `default: true` su una sola view per entita
- documentare ogni nuova entita anche su `docs/acl-resources-map.md`

## 13) Checklist "nuova entita" (da zero)
1. creare cartella `backend/config/entities/<entity-id>/`
2. creare `base.json`
3. creare `list/index.json` + almeno una view in `list/views/`
4. creare `detail/index.json` + sezioni in `detail/sections/`
5. creare `form/index.json` + sezioni in `form/sections/` (se entita editabile)
6. aggiungere risorsa ACL `entity:<entity-id>` in `backend/config/acl/resources/entity.json`
7. avviare backend in dev e verificare hot reload config
8. testare endpoint:
   - `GET /entities/:entityId/config`
   - `GET /entities/:entityId/list`
   - `GET /entities/:entityId/records/:recordId`
   - `POST/PUT /entities/:entityId/records`
9. correggere eventuali `422` su field path invalidi
10. aggiornare documentazione (`docs/entity-config-guide.md` se cambia il contratto)

## 14) Limiti attuali da considerare nel progetto nuovo
- non esiste schema JSON hard-enforced a build time (validazione e runtime/lazy)
- i file JSON invalidi vengono skippati, non bloccano il bootstrap
- le query raw via string in `where` sono potenti ma riducono controllabilita
- la metadata `lookup` e applicata lato frontend; non fa parte della validazione campi backend completa

Per un progetto nuovo si raccomanda di aggiungere in CI:
- validazione statica JSON schema per `base/list/detail/form`
- smoke test automatico su tutte le entita configurate
- controllo lint custom su placeholder e path relazionali
