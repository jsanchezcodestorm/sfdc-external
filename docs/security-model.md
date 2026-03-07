# Security Model

## 1) Scopo
Questo documento definisce il modello di sicurezza della piattaforma middleware:
- autenticazione
- autorizzazione (ACL)
- visibility row-level/field-level
- protezione dei dati
- audit e controlli operativi

Il documento e vincolante per backend, frontend, configurazioni e pipeline di rilascio.

## 2) Obiettivi di sicurezza
- prevenire accessi non autorizzati a endpoint e dati
- prevenire data leak tra utenti con permessi diversi
- garantire tracciabilita completa delle decisioni di accesso
- rendere il sistema fail-closed in caso di errore nei controlli
- minimizzare il blast radius in caso di compromissione di componenti singoli

## 3) Assunzioni e confini
- Salesforce resta system of record per i dati business
- PostgreSQL e repository unico per policy visibility, cache e audit visibility
- enforcement di sicurezza finale esclusivamente lato backend
- frontend considerato client non trusted
- tutte le comunicazioni esterne passano su HTTPS/TLS

## 4) Asset e classificazione dati
Classi minime:
- `PUBLIC`: metadati non sensibili (es. documentazione tecnica)
- `INTERNAL`: configurazioni operative non pubbliche
- `CONFIDENTIAL`: dati utente, record business, decisioni visibility
- `SECRET`: credenziali, chiavi, token, secret applicativi

Regole:
- dati `CONFIDENTIAL` e `SECRET` non devono comparire in log applicativi in chiaro
- dati `SECRET` non devono mai essere committati su repository

## 5) Attori e minacce principali
Attori:
- utente autenticato
- utente non autenticato
- amministratore applicativo
- servizio backend
- servizi esterni (Google, Salesforce)

Minacce prioritarie:
- bypass ACL su endpoint dati
- bypass visibility tramite query non scoped
- escalation privilegi via manipolazione input
- injection in query builder/DSL
- riuso sessione o furto cookie
- esposizione segreti da env/log
- stale policy con accessi non coerenti

## 6) Trust boundaries
- browser -> backend API
- backend -> Salesforce API
- backend -> PostgreSQL
- backend -> servizi Google
- CI/CD -> runtime environment

Ogni attraversamento boundary richiede validazione esplicita e logging di sicurezza.

## 7) Autenticazione
Metodo:
- login federato Google
- validazione identita lato backend
- mapping su Contact Salesforce attivo

Sessione:
- JWT interno in cookie `HttpOnly`
- `Secure=true` in produzione
- `SameSite` configurato per contesto di deploy
- binding sessione su IP (se abilitato da policy runtime)
- rotazione token su restore session

Error handling:
- nessun dettaglio sensibile negli errori di autenticazione
- messaggi utente generici, dettagli tecnici solo log interni

## 8) Autorizzazione applicativa (ACL)
Modello:
- risorse versionate per categorie: `rest:*`, `entity:*`, `query:*`, `route:*`
- permessi risolti da profilo utente autenticato come merge di default globali e assegnazioni dirette al Contact

Regole:
- controllo ACL obbligatorio su ogni endpoint protetto
- default deny su risorsa non mappata
- nessuna decisione autorizzativa delegata al frontend
- per i query template, ACL (`query:<templateId>`) e sorgente unica autorizzativa (`MUST`)
- metadata template (es. `permissions.roles`) non devono concedere accesso in fallback (`MUST NOT`)

## 9) Visibility policy model
Principio:
- ACL decide cosa puoi usare
- visibility decide quali record/campi puoi vedere

Regole core:
- deny-by-default
- precedenza `DENY` su `ALLOW`
- enforcement centralizzato nel visibility engine
- fail-closed in caso di errore compilazione/policy store/cache inconsistente

Storage:
- policy su PostgreSQL (`visibility.cones`, `visibility.rules`, `visibility.assignments`)
- nessun uso di custom object Salesforce per policy visibility

## 10) Security pipeline per ogni request dati
Ordine obbligatorio:
1. validazione sessione autenticata
2. validazione CSRF + `Origin/Referer` per endpoint mutativi browser (`POST|PUT|PATCH|DELETE`)
3. validazione input DTO/schema
4. verifica ACL risorsa
5. costruzione visibility context (utente, permessi, recordType, oggetto)
6. risoluzione policy e compilazione predicate
7. esecuzione query scoped
8. field-level filtering (se applicabile)
9. audit della decisione finale

Se uno step fallisce: risposta deny coerente + audit reason code.

## 11) Query security policy
Regole globali:
- tutte le query business devono passare da layer centralizzato
- proibito eseguire query non scoped in percorsi protetti da visibility

Raw query endpoint:
- consentito solo a profili admin autorizzati
- protetto da feature flag dedicata
- disabilitato in produzione per default
- solo statement read-only esplicitamente consentiti

Template/DSL:
- whitelist operatori supportati (hard-enforced)
- validazione placeholders e tipi
- escape obbligatorio dei literal
- limiti hard su profondita/numero nodi/cardinalita
- reject `where` raw/string non strutturato in Fase 1

## 12) Field-level security applicativa
Regole minime:
- set campi visibili = intersezione whitelist ALLOW applicabili
- campi negati esplicitamente (`fields_denied`) rimossi dal set finale
- se set finale vuoto: deny

Obbligo:
- mai assumere che la selezione campi front-end sia sufficiente
- enforcement e mascheramento devono avvenire lato backend

## 13) Input validation e anti-injection
Controlli minimi:
- validazione DTO su endpoint pubblici/protetti
- whitelist nomi campi/oggetti/operatori
- sanitizzazione e escaping centralizzati
- rifiuto input non riconosciuto (`forbidNonWhitelisted`)

Divieti:
- concatenazione query con input raw non validato
- fallback permissivi in caso di parsing error

## 14) Data protection
In transit:
- TLS obbligatorio tra client/backend e backend/servizi esterni

At rest:
- cifratura storage gestita da infrastruttura (DB/volumi)
- backup cifrati e retention controllata

Data minimization:
- restituire solo campi necessari allo use case
- limitare dati personali nei log applicativi

## 15) Secrets management
Fonti consentite:
- environment variables runtime
- secret manager di infrastruttura

Regole:
- nessun secret hardcoded
- rotazione periodica credenziali
- separazione secret per ambiente (`dev`, `staging`, `prod`)
- accesso ai secret con least privilege

## 16) Audit e accountability
Obiettivo:
- ricostruire sempre chi ha visto cosa, quando e perche

### 16.1 Audit visibility (decisioni row/field-level)
Campi minimi:
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
- `policy_version`
- `duration_ms`

Tassonomia reason code (`decision_reason_code`):
- `ALLOW_MATCH`
- `DENY_MATCH`
- `NO_ALLOW_RULE`
- `INVALID_RULE_DROPPED`
- `FIELDSET_EMPTY`
- `POLICY_STALE`
- `QUERY_LIMIT_EXCEEDED`
- `NON_SELECTIVE_QUERY`

### 16.2 Audit security gateway (pre-visibility)
Campi minimi:
- `request_id`
- `created_at`
- `contact_id` (nullable se non autenticato)
- `endpoint`
- `http_method`
- `event_type` (`AUTH`, `SESSION`, `CSRF`, `CURSOR`, `INPUT`)
- `decision` (`ALLOW|DENY`)
- `reason_code`
- `ip_hash`
- `user_agent_hash`

Tassonomia reason code (`reason_code`):
- `CSRF_VALIDATION_FAILED`
- `CURSOR_SCOPE_MISMATCH`
- `CURSOR_EXPIRED`
- `SESSION_INVALID`
- `ORIGIN_NOT_ALLOWED`
- `INPUT_VALIDATION_FAILED`

Retention:
- dettaglio audit: 180 giorni
- aggregati: 24 mesi

### 16.3 Audit query runtime (post-visibility)
Scope:
- query SOQL runtime gia risolte e scoped, eseguite dopo un esito `ALLOW` del gateway auth/ACL/visibility

Campi minimi:
- `request_id`
- `created_at`
- `completed_at`
- `contact_id`
- `query_kind`
- `target_id`
- `object_api_name`
- `record_id` (nullable)
- `status` (`PENDING|SUCCESS|FAILURE`)
- `resolved_soql`
- `base_where`
- `base_where_hash`
- `final_where`
- `final_where_hash`
- `row_count`
- `duration_ms`
- `error_code`

Regole:
- lo stream `query` e separato da `application`
- il SOQL completo puo essere persistito solo per gli stream esplicitamente approvati; per questo runtime la persistenza completa e voluta
- ogni failure Salesforce successiva a un `ALLOW` visibility deve lasciare evidenza sia nello stream `visibility` sia nello stream `query`

## 17) Cache security e propagation SLA
Regole:
- cache keyed by utente/perms/recordType/oggetto/versione policy
- invalidazione obbligatoria su ogni modifica `visibility.cones`, `visibility.rules`, `visibility.assignments`
- aggiornamento versione policy atomico con la modifica

SLA:
- target propagazione policy: P95 <= 30s
- hard limit: <= 120s
- oltre hard limit: fail-closed + audit `POLICY_STALE`

## 18) Logging e monitoraggio sicurezza
Obbligatorio:
- log strutturati con `request_id`
- metriche su deny ratio, errori policy engine, hit/miss cache
- alert su picchi 401/403
- alert su fallimenti policy compile
- alert su timeout Salesforce
- alert su degradazione SLA propagazione policy

## 19) Error handling sicuro
Regole:
- non esporre stacktrace o dettagli interni al client
- mappare errori security in codici HTTP coerenti (`401`, `403`)
- separare messaggio utente da dettaglio tecnico interno

## 20) Sicurezza CI/CD e supply chain
Controlli minimi pipeline:
- lint e type-check obbligatori
- test automatici su auth/ACL/visibility
- blocco merge se test security critici falliscono
- lockfile versionato e dependency review periodica

Controlli release:
- migrazioni DB tracciate e idempotenti
- verifica variabili env obbligatorie
- smoke test endpoint protetti post deploy

## 21) Incident response (sintesi)
Fasi:
1. detection e classificazione severita
2. contenimento (disabilitazione feature flag, blocco endpoint a rischio)
3. eradicazione e fix
4. recovery con verifiche di sicurezza
5. post-mortem con azioni correttive

Output obbligatori:
- timeline evento
- root cause
- impatto dati/utenti
- misure preventive permanenti

## 22) Controlli obbligatori (checklist)
- session cookie `HttpOnly` e `Secure` in produzione
- ACL enforced su tutti endpoint protetti
- visibility deny-by-default attiva
- policy visibility solo su PostgreSQL
- raw query endpoint disabilitato in produzione
- audit visibility attivo con reason code
- invalidazione cache policy operativa
- test matrix visibility verde
- secret management conforme
- runbook produzione aggiornato

## 23) Non-obiettivi espliciti
- non implementare sicurezza lato frontend come controllo definitivo
- non usare policy visibility duplicate in Salesforce
- non introdurre bypass temporanei non auditati nei percorsi dati

## 24) Documenti correlati
- `docs/architecture-overview.md`
- `docs/acl-resources-map.md`
- `docs/query-template-guide.md`
- `docs/visibility-cones-guide.md`
- `docs/prisma-postgres-guide.md`
- `docs/runbook-production.md`
