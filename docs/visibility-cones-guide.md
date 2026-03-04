# Visibility Cones Guide

## 1) Scopo
Questo documento definisce il modello ufficiale dei coni di visibilita per il middleware.

Obiettivi:
- garantire row-level e field-level visibility coerente per utente
- centralizzare enforcement lato backend con approccio fail-closed
- fornire un contratto tecnico stabile per progetto nuovo da zero

Decisione architetturale vincolante:
- il repository policy dei coni e solo PostgreSQL
- non usare custom object Salesforce per policy cones/rules/assignments

## 2) Ambito
Questo documento copre:
- modello dati policy su PostgreSQL
- DSL regole visibility v1
- algoritmo di valutazione e precedenze
- caching, invalidazione e SLA di propagazione
- audit contract e reason codes
- test matrix obbligatoria

Questo documento non copre:
- ACL resources map dettagliata (vedi `docs/acl-resources-map.md`)
- struttura entity config JSON (vedi `docs/entity-config-guide.md`)
- contratto query template completo (vedi `docs/query-template-guide.md`)

## 3) Terminologia
- `Cone`: contenitore logico di regole visibility con priorita
- `Rule`: regola ALLOW o DENY su un oggetto Salesforce
- `Assignment`: legame tra cone e target applicativo (contact, permission, recordType)
- `Visibility Context`: contesto runtime per valutazione policy (`contactId`, permissions, recordType, object)
- `Policy Version`: versione monotona della policy usata per caching e audit

## 4) Principi non negoziabili
- `deny-by-default`: senza almeno una ALLOW valida, nessun dato
- `DENY` prevale sempre su `ALLOW`
- enforcement finale solo backend (frontend non trusted)
- ogni query dati protetta passa da visibility engine
- in caso di errore policy/cache incoerente: fail-closed

## 5) Posizionamento nel pipeline di sicurezza
Ordine obbligatorio per richieste dati:
1. sessione autenticata valida
2. validazione input
3. verifica ACL capability (`rest/entity/query/route`)
4. risoluzione visibility context
5. compilazione predicate visibility
6. esecuzione query scoped
7. eventuale field-level filtering
8. audit decisione finale

## 6) Data model PostgreSQL (repository unico)
Schema minimo `visibility`:

### 6.1 `visibility.cones`
Campi minimi:
- `id` (uuid pk)
- `code` (varchar unique)
- `name` (varchar)
- `priority` (int)
- `active` (boolean)
- `updated_at` (timestamptz)

### 6.2 `visibility.rules`
Campi minimi:
- `id` (uuid pk)
- `cone_id` (fk -> cones.id)
- `object_api_name` (varchar)
- `effect` (varchar check `ALLOW|DENY`)
- `condition_json` (jsonb)
- `fields_allowed` (jsonb, opzionale)
- `active` (boolean)
- `updated_at` (timestamptz)

### 6.3 `visibility.assignments`
Campi minimi:
- `id` (uuid pk)
- `cone_id` (fk -> cones.id)
- `contact_id` (varchar null)
- `permission_code` (varchar null)
- `record_type` (varchar null)
- `valid_from` (timestamptz null)
- `valid_to` (timestamptz null)
- `updated_at` (timestamptz)

### 6.4 `visibility.user_scope_cache`
Campi minimi:
- `cache_key` (varchar pk)
- `object_api_name` (varchar)
- `policy_version` (bigint)
- `compiled_predicate` (text)
- `compiled_fields` (jsonb)
- `expires_at` (timestamptz)
- `updated_at` (timestamptz)

### 6.5 `visibility.audit_log`
Campi minimi:
- `id` (bigserial pk)
- `request_id` (varchar)
- `created_at` (timestamptz)
- `contact_id` (varchar)
- `permissions_hash` (varchar)
- `record_type` (varchar)
- `object_api_name` (varchar)
- `query_kind` (varchar)
- `base_where_hash` (varchar)
- `final_where_hash` (varchar)
- `applied_cones` (jsonb)
- `applied_rules` (jsonb)
- `decision` (varchar `ALLOW|DENY`)
- `decision_reason_code` (varchar)
- `row_count` (int)
- `duration_ms` (int)
- `policy_version` (bigint)

## 7) Indici minimi raccomandati
- `rules(object_api_name, active)`
- `assignments(contact_id, permission_code, record_type, valid_from, valid_to)`
- indice parziale su `assignments` con `record_type IS NULL`
- partizionamento mensile `audit_log` su `created_at`

## 8) Risoluzione assignment (deterministica)
Contesto runtime:
- `contact_id`
- `permissions[]`
- `record_type`
- `now`

Assignment applicabile se:
- `valid_from` assente o `valid_from <= now`
- `valid_to` assente o `valid_to >= now`
- match per almeno una dimensione:
  - `contact_id` esatto
  - `permission_code` in `permissions[]`
  - `record_type` uguale

Ordinamento cone applicabili:
1. `priority DESC`
2. `code ASC` (tie-break stabile)

## 9) Algoritmo di valutazione policy
1. Caricare coni applicabili da assignment validi.
2. Caricare regole attive dei coni per `object_api_name` richiesto.
3. Validare e compilare ogni regola in predicate SOQL.
4. Costruire `ALLOW_EXPR` come OR di ALLOW valide.
5. Costruire `DENY_EXPR` come OR di DENY valide.
6. Se `ALLOW_EXPR` e vuota -> `DENY` (`NO_ALLOW_RULE`).
7. Comporre filtro finale:
   - `FINAL = (BASE_WHERE) AND (ALLOW_EXPR) AND NOT (DENY_EXPR)`
8. Applicare field-level set finale:
   - intersezione whitelist ALLOW
   - meno eventuali deny field explicit
9. Se set campi finale e vuoto -> `DENY` (`FIELDSET_EMPTY`).
10. Audit obbligatorio con regole/coni applicati e reason code.

Regole invalide:
- regola invalida -> scarto + audit `INVALID_RULE_DROPPED`
- se dopo lo scarto non resta alcuna ALLOW valida -> `DENY`

## 10) DSL v1 ufficiale (regole visibility)
### 10.1 Strutture supportate
- predicato atomico:
  - `{ "field": "<FieldPath>", "op": "<Operator>", "value": <Value> }`
- gruppo AND:
  - `{ "all": [ <Rule>, ... ] }`
- gruppo OR:
  - `{ "any": [ <Rule>, ... ] }`
- negazione:
  - `{ "not": <Rule> }`

Definizione:
- `Rule = Predicate | GroupAll | GroupAny | GroupNot`

### 10.2 Operatori ammessi
- `=` `!=` `>` `>=` `<` `<=`
- `IN` `NOT IN`
- `LIKE`
- `STARTS_WITH` (compile in `LIKE 'value%'`)
- `CONTAINS` (compile in `LIKE '%value%'`)
- `IS_NULL` `IS_NOT_NULL`

### 10.3 Limiti hard obbligatori
- profondita massima albero: `6`
- nodi massimi per regola: `100`
- figli massimi per gruppo `all/any`: `20`
- cardinalita massima array `IN/NOT IN`: `200`
- lunghezza massima string literal: `255`

Limiti query compilata:
- lunghezza massima SOQL compilata: `20000`
- campi massimi `SELECT`: `100`
- clausole massime `ORDER BY`: `3`
- disgiunzioni `OR` massime dopo compilazione: `25`
- su oggetti high-volume (`>= 100000` record): almeno un predicato selettivo su campo indicizzato o external id

### 10.4 Validazioni obbligatorie
- `field` deve matchare regex `^[A-Za-z_][A-Za-z0-9_.]*$`
- `op` deve essere in whitelist operatori
- `IN/NOT IN` richiedono array non vuoto
- `IS_NULL/IS_NOT_NULL` non accettano `value`
- escaping obbligatorio di ogni literal prima della compilazione SOQL

Esiti invalidazione DSL:
- oltre limiti hard -> `DENY` + `QUERY_LIMIT_EXCEEDED`
- non selettiva su high-volume -> `DENY` + `NON_SELECTIVE_QUERY`
- regola invalida -> scarto; se nessuna ALLOW resta valida -> `DENY`

## 11) Matrice copertura query (Fase 1 visibility)
| Tipo query/endpoint | Copertura Fase 1 | Note |
| --- | --- | --- |
| Entity list | Coperto | Enforce row-level su oggetto lista |
| Entity detail | Coperto | Enforce row-level su record singolo |
| Entity related list | Coperto | Enforce row-level su oggetto related |
| Entity form (read prefill) | Coperto | Enforce su query caricamento form |
| Entity bundle (read) | Coperto | Enforce su sotto-query incluse |
| Query template DSL/SOQL | Coperto | Enforce su oggetto target template |
| Pagination `queryMore` | Coperto | Solo cursor opaco scoped |
| Global search | Escluso | Fase successiva |
| Raw query `/salesforce/query` | Escluso | Solo debug admin, default off in prod |
| Write operations | Escluso | Governate da ACL + business rules dedicate |

## 12) Field-level visibility
Regole minime:
- set campi visibili = intersezione whitelist ALLOW applicabili
- campi negati esplicitamente rimossi dal set finale
- se il set finale e vuoto -> `DENY`

Nota:
- `fields_allowed` e parte della policy visibility, non sostituisce ACL.

## 13) Cache policy: chiavi, invalidazione, SLA
### 13.1 Chiavi cache minime
- `policy_definition`: `object_api_name|policy_version`
- `user_scope`: `contact_id|permissions_hash|record_type|object_api_name|policy_version`

### 13.2 Regole di invalidazione
Ogni modifica a:
- `visibility.cones`
- `visibility.rules`
- `visibility.assignments`

deve:
1. incrementare `policy_version`
2. invalidare cache correlate all `object_api_name` coinvolto
3. garantire atomicita tra modifica policy, update versione e invalidazione

Requisito operativo:
- endpoint di purge completa in emergenza

### 13.3 SLA propagazione
- target operativo: `P95 <= 30s`
- limite massimo: `<= 120s`
- oltre limite massimo: fail-closed + audit `POLICY_STALE`

## 14) Contratto audit minimo (obbligatorio)
Campi obbligatori evento audit:
- `request_id`
- `created_at`
- `contact_id`
- `permissions_hash`
- `record_type`
- `object_api_name`
- `query_kind`
- `base_where_hash`
- `final_where_hash`
- `applied_cones`
- `applied_rules`
- `decision`
- `decision_reason_code`
- `row_count`
- `duration_ms`
- `policy_version`

Retention minima:
- dettaglio: `180 giorni`
- aggregati giornalieri: `24 mesi`

## 15) `decision_reason_code` minimi
- `ALLOW_MATCH`
- `DENY_MATCH`
- `NO_ALLOW_RULE`
- `INVALID_RULE_DROPPED`
- `FIELDSET_EMPTY`
- `POLICY_STALE`
- `CSRF_VALIDATION_FAILED`
- `CURSOR_SCOPE_MISMATCH`
- `CURSOR_EXPIRED`
- `QUERY_LIMIT_EXCEEDED`
- `NON_SELECTIVE_QUERY`

## 16) Test matrix obbligatoria
| ID | Scenario | Esito atteso |
| --- | --- | --- |
| `VIZ-01` | Nessuna assignment valida per utente/oggetto | `DENY` |
| `VIZ-02` | Almeno una ALLOW valida e matchata | `ALLOW` |
| `VIZ-03` | ALLOW e DENY entrambe matchate | `DENY` |
| `VIZ-04` | Piu ALLOW matchate | composizione OR corretta |
| `VIZ-05` | Regola invalida ma altre ALLOW valide | esito coerente + audit invalid rule |
| `VIZ-06` | Tutte le ALLOW scartate come invalide | `DENY` |
| `VIZ-07` | Intersezione field-level ALLOW vuota | `DENY` |
| `VIZ-08` | Assignment scaduta | non applicata |
| `VIZ-09` | Assignment per permission_code matchata | applicata |
| `VIZ-10` | Assignment record_type non compatibile | non applicata |
| `VIZ-11` | `queryMore` cursor non scoped/valido | `DENY` + cursor reason code |
| `VIZ-12` | Modifica policy con cache calda | propagazione entro SLA |
| `VIZ-13` | Audit evento decisione | tutti i campi obbligatori presenti |
| `VIZ-14` | Performance compilazione policy | entro budget |
| `VIZ-15` | Query compilata oltre limiti hard | `DENY` + `QUERY_LIMIT_EXCEEDED` |
| `VIZ-16` | Query non selettiva high-volume | `DENY` + `NON_SELECTIVE_QUERY` |

Gate rilascio:
- nessun test `VIZ-01..VIZ-16` fallito
- copertura unit visibility compiler/enforcer >= `90%`

## 17) Sicurezza operativa minima
- raw query endpoint disabilitato in produzione (`ENABLE_RAW_SALESFORCE_QUERY=false`)
- cursor pagination solo opachi e scoped
- sanitizzazione placeholder/literal centralizzata
- log strutturati con `request_id`
- alert su:
  - spike 401/403
  - policy engine failures
  - degradazione SLA propagazione

## 18) Variabili ambiente consigliate
- `VISIBILITY_DB_SCHEMA`
- `VISIBILITY_CACHE_TTL_SECONDS`
- `VISIBILITY_AUDIT_ENABLED`
- `VISIBILITY_POLICY_PROPAGATION_TARGET_SECONDS` (default `30`)
- `VISIBILITY_POLICY_PROPAGATION_HARD_LIMIT_SECONDS` (default `120`)
- `VISIBILITY_AUDIT_RETENTION_DAYS` (default `180`)
- `VISIBILITY_AUDIT_AGGREGATE_RETENTION_MONTHS` (default `24`)

## 19) Criteri di accettazione
Il tema coni e accettato quando:
- ogni endpoint dati coperto applica visibility con deny-by-default
- nessun endpoint protetto puo bypassare il visibility engine
- precedenza `DENY > ALLOW` verificata con test automatici
- invalidazione cache e SLA propagazione rispettati
- audit permette di ricostruire sempre il perche di ALLOW/DENY

## 20) Non-obiettivi (Fase 1)
- policy storage su Salesforce custom objects
- global search con visibility completa
- write-time row-level cones (create/update/delete)
- registry pubblico template/policy per utenti finali

## 21) Documenti correlati
- `docs/architecture-overview.md`
- `docs/security-model.md`
- `docs/acl-resources-map.md`
- `docs/query-template-guide.md`
- `docs/entity-config-guide.md`
- `docs/prisma-postgres-guide.md`
- `docs/runbook-production.md`
