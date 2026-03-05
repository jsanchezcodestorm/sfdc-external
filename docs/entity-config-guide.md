# Entity Config Guide

## 1) Scopo
Questo documento definisce il contratto tecnico delle configurazioni entita (`Entity Config`) usate dal backend per:
- listing (`list`)
- dettaglio (`detail`)
- form create/edit (`form`)
- related lists

Obiettivo: permettere un progetto nuovo da zero con configurazione versionata, senza hardcode diffuso.

## 2) Fonte di verita e runtime
Fonte di verita:
- PostgreSQL (tabelle `entity_*` gestite via Prisma migration)

Comportamento runtime (`EntitiesService`):
- carica la configurazione entita dalla repository Postgres on-demand
- applica cache in-memory per `entityId` + deduplica load concorrenti
- se il record entita non esiste: `404`
- se il payload JSONB persistito e invalido rispetto al contratto: `400`

Nota operativa:
- la validazione campi Salesforce e lazy: avviene alla prima richiesta runtime dell'entita (`getValidatedEntityConfigOrThrow`), non al bootstrap.

## 3) Struttura storage obbligatoria (PostgreSQL)
```text
entity_configs
entity_list_configs
entity_list_view_configs
entity_detail_configs
entity_detail_section_configs
entity_related_list_configs
entity_form_configs
entity_form_section_configs
```

Regole:
- `entity_configs.id` e l identificatore tecnico univoco (`entityId`)
- blocchi `list`, `detail`, `form` sono opzionali e modellati come record 1:1
- viste/sezioni/related lists sono modellate come record 1:N con `sortOrder`
- campi annidati (`query`, `columns`, `actions`, `fields`, `pathStatus`) sono persistiti come JSONB

## 4) Contratto `base` (`entity_configs`)
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
### 5.1 Manifest `list` (`entity_list_configs`)
Campi principali:
- `title` (required)
- `subtitle` (optional)
- `primaryAction` (optional)
- `views` (required): relazione verso `entity_list_view_configs`

Vincolo:
- deve esistere almeno una view valida per `entityId`

### 5.2 View `list` (`entity_list_view_configs`)
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
### 6.1 Manifest `detail` (`entity_detail_configs`)
Campi principali:
- `query` (required)
- `sections` (required in pratica UI): relazione verso `entity_detail_section_configs`
- `relatedLists` (optional): relazione verso `entity_related_list_configs`
- `titleTemplate`, `fallbackTitle`, `subtitle`, `actions`, `pathStatus` (optional)

### 6.2 Sezioni `detail` (`entity_detail_section_configs`)
Struttura:
- `title`, `fields[]`
- ogni field puo avere `label` + (`field` oppure `template`)
- supportati `highlight` e `format` (`date` | `datetime`)

### 6.3 Related lists `detail` (`entity_related_list_configs`)
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
### 7.1 Manifest `form` (`entity_form_configs`)
Campi:
- `title.create`, `title.edit` (required)
- `query` (required)
- `sections` (required in pratica UI): relazione verso `entity_form_section_configs`
- `subtitle` (optional)

### 7.2 Sezioni `form` (`entity_form_section_configs`)
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
- mantenere `entity_configs.id == entityId` usato in ACL e routing
- in `query.fields` includere sempre `Id` nelle viste tabellari e dettaglio
- evitare `where` string raw se non strettamente necessario; preferire condizioni object
- per azioni `link`, usare target relativi e placeholder espliciti (`view/{{Id}}`)
- usare `default: true` su una sola view per entita
- documentare ogni nuova entita anche su `docs/acl-resources-map.md`

## 13) Checklist "nuova entita" (da zero)
1. creare/aggiornare migration Prisma per inserire record in `entity_configs`
2. inserire blocco `list` in `entity_list_configs` + almeno una view in `entity_list_view_configs`
3. inserire blocco `detail` in `entity_detail_configs` + sezioni in `entity_detail_section_configs`
4. inserire blocco `form` in `entity_form_configs` + sezioni in `entity_form_section_configs` (se entita editabile)
5. aggiungere risorsa ACL `entity:<entity-id>` in `backend/config/acl/resources/entity.json`
6. applicare migrazione (`prisma migrate dev|deploy`) e rigenerare client Prisma
7. testare endpoint:
   - `GET /entities/:entityId/config`
   - `GET /entities/:entityId/list`
   - `GET /entities/:entityId/records/:recordId`
   - `POST/PUT /entities/:entityId/records`
8. correggere eventuali `422` su field path invalidi
9. aggiornare documentazione (`docs/entity-config-guide.md` se cambia il contratto)

## 14) Limiti attuali da considerare nel progetto nuovo
- non esiste schema JSON hard-enforced a build time (validazione e runtime/lazy)
- payload JSONB invalidi rispetto al contratto producono errore runtime lato backend
- le query raw via string in `where` sono potenti ma riducono controllabilita
- la metadata `lookup` e applicata lato frontend; non fa parte della validazione campi backend completa

## 15) Admin configurazione (PostgreSQL)
Endpoint admin (solo `PORTAL_ADMIN`):
- `GET /entities/admin/configs`: lista entita configurate con summary (views/sezioni/related/form)
- `GET /entities/admin/configs/:entityId`: configurazione completa entity
- `PUT /entities/admin/configs/:entityId`: upsert configurazione completa (`{ "entity": { ... } }`)

UI frontend admin:
- route hash persistente `#/admin/entity-config/:entityId/:section`
- sidebar sinistra fissa full-height con category `Entity PostgreSQL` e sub category `Base/List/Detail/Form`
- editor JSON sezione + salvataggio su PostgreSQL

Per un progetto nuovo si raccomanda di aggiungere in CI:
- validazione statica JSON schema per `base/list/detail/form`
- smoke test automatico su tutte le entita configurate
- controllo lint custom su placeholder e path relazionali
