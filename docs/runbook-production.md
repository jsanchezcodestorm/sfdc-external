# Runbook Production

## 1) Scopo
Questo runbook descrive le procedure operative di produzione per il middleware.

Obiettivi:
- rilasciare in modo sicuro e ripetibile
- ridurre MTTR in caso di incident
- mantenere coerenza con security model, visibility cones e policy PostgreSQL

## 2) Ambito
Coperto:
- release management
- deploy applicativo
- migrazioni PostgreSQL/Prisma
- smoke test post deploy
- rollback applicativo
- incident response operativa

Non coperto:
- sviluppo funzionalita
- dettagli di implementazione business

## 3) Ruoli operativi minimi
- `Release Owner`: guida go/no-go del rilascio
- `Deploy Operator`: esegue deploy e verifiche tecniche
- `DB Owner`: valida migrazioni e stato PostgreSQL
- `Security Owner`: valuta incident di sicurezza e data exposure

Regola:
- in produzione nessun rilascio senza ownership esplicita dei ruoli sopra.

## 4) Prerequisiti accesso
Accessi minimi richiesti:
- repository Git remoto
- runtime target (Amplify e/o host VM con PM2)
- variabili ambiente produzione aggiornate
- accesso log applicativi e metriche
- accesso PostgreSQL produzione (solo ruoli autorizzati)

## 5) Inventario configurazioni critiche
Verificare prima di ogni deploy:
- sessione/auth: `JWT_SECRET`, `JWT_EXPIRES_IN`, `SESSION_COOKIE_*`, `FRONTEND_ORIGINS`
- Salesforce: `SALESFORCE_*`, `SALESFORCE_DESCRIBE_CACHE_TTL_MS`, `SALESFORCE_DESCRIBE_STALE_WHILE_REVALIDATE_MS`
- Google: `GOOGLE_CLIENT_ID` (+ secret/redirect se flow code)
- visibility/postgres: `DATABASE_URL`, `VISIBILITY_*`
- hardening: `ENABLE_RAW_SALESFORCE_QUERY=false` in produzione

Regola sicurezza:
- nessun secret in repository o release notes.

## 6) Processo release (versione)
### 6.1 Preparazione release
1. determinare versione SemVer (`X.Y.Z`)
2. creare file note release: `docs/releases/RELEASE_NOTES_vX.Y.Z.md`
3. verificare working tree pulito

### 6.2 Check locali obbligatori
```bash
npm install
npm run lint --workspaces
npm run build
```

Se Prisma e attivo nel backend:
```bash
npm exec --workspace backend prisma -- validate --schema prisma/schema.prisma
npm exec --workspace backend prisma -- generate --schema prisma/schema.prisma
```

### 6.3 Tag e push release
```bash
bin/create-release.sh X.Y.Z
```

Output atteso script:
- update `package.json`
- commit `chore: release vX.Y.Z`
- tag `vX.Y.Z`
- push commit e tag

## 7) Strategie deploy supportate (profili di riferimento)
Questo capitolo definisce profili operativi di esempio.
Regola:
- usare solo i profili/file realmente presenti nel repository/ambiente target
- se un artifact o script non esiste nel contesto, adattare la checklist mantenendo invariati i controlli di sicurezza/go-no-go

### 7.1 Modalita A: Amplify Hosting
Riferimenti (esempio per questo repository):
- `amplify.yml`
- `bin/postbuild.sh`
- `deploy-manifest.json`

Flusso:
1. pipeline Amplify builda frontend e backend
2. `bin/postbuild.sh` prepara `.amplify-hosting/compute/default`
3. artifact contiene:
   - `dist/` backend
   - `public/` frontend
   - `config/` backend
   - `deploy-manifest.json`

Controlli critici:
- runtime `nodejs22.x` nel manifest
- presenza `dist/main.js`
- presenza `public/index.html`

### 7.2 Modalita B: VM + PM2
Riferimenti (esempio per questo repository):
- `bin/deploy-pm2.sh`
- `deploy-cs-backoffice.sh`
- `backend/ecosystem.config.js`

Deploy standard:
```bash
bin/deploy-pm2.sh
```

Wrapper ambiente fisso (se usato):
```bash
./deploy-cs-backoffice.sh
```

Cosa fa `deploy-pm2.sh`:
1. verifica working tree pulito
2. `git fetch` + `git pull --ff-only`
3. `npm ci`
4. `npm run build`
5. `pm2 reload` (o `pm2 start` se assente)
6. `pm2 save`

## 8) Migrazioni PostgreSQL in produzione
Se il backend usa Prisma in produzione:

```bash
npm exec --workspace backend prisma -- migrate deploy --schema prisma/schema.prisma
```

Regole:
- eseguire migrazioni prima del traffico pieno
- non usare `prisma migrate dev` in produzione
- nessun `prisma migrate reset` in produzione
- migrazioni fallite => stop deploy e avvio rollback

## 9) Smoke test post deploy (obbligatori)
### 9.1 Smoke tecnico base
- health endpoint configurato (es. `GET /api/health` o `GET /api`) deve rispondere `2xx`
- il body di health check puo variare per progetto; non usare una stringa testuale hardcoded come unico criterio
- `GET /api/docs` raggiungibile
- frontend servito correttamente (`/`)

### 9.2 Smoke funzionale minimo
- login utente valido (`/auth/google` + `/auth/session`)
- query base protetta via cookie (`POST /query`)
- entity list di almeno una entita autorizzata
- endpoint critico business di dominio principale

### 9.3 Smoke sicurezza minimo
- endpoint protetto senza cookie -> `401`
- risorsa non autorizzata -> `403`
- raw query disabilitata in produzione secondo policy ambiente
- nessun errore massivo 5xx nei primi minuti

## 10) Criteri go/no-go post deploy
Go se tutti veri:
- build/deploy conclusi senza errori
- smoke test verdi
- alerting stabile (nessun picco critico 401/403/5xx)
- metriche latenza entro soglia

No-go se almeno uno vero:
- fallimento migrazione DB
- regressione auth/sessione
- endpoint core indisponibili
- error rate elevato persistente

## 11) Rollback applicativo
### 11.1 Trigger rollback
- errore critico non mitigabile rapidamente
- impatto utenti alto
- rischio sicurezza attivo

### 11.2 Procedura rollback rapida (VM + PM2)
1. identificare ultimo tag stabile
2. checkout tag/commit stabile su host
3. `npm ci`
4. `npm run build`
5. `pm2 reload <app> --update-env`
6. rieseguire smoke test

Nota DB:
- evitare rollback schema distruttivo
- preferire fix forward con nuova migrazione compatibile

### 11.3 Procedura rollback (Amplify)
1. promuovere artifact/build precedente stabile
2. verificare env non cambiato in modo incompatibile
3. rieseguire smoke test

## 12) Incident response operativo
### 12.1 Classificazione severita
- `SEV-1`: indisponibilita totale o data leak
- `SEV-2`: funzionalita core degradate
- `SEV-3`: degrado limitato, workaround disponibile

### 12.2 Flusso standard
1. detection e triage
2. contenimento
3. mitigazione/rollback
4. recovery verificata
5. post-mortem

## 13) Playbook incident per scenario
### 13.1 Auth/sessione (401 anomali)
- verificare cookie config (`SESSION_COOKIE_*`, dominio, secure, samesite)
- verificare `FRONTEND_ORIGINS`
- verificare validita `JWT_SECRET`
- rollback se regressione introdotta da ultimo deploy

### 13.2 Salesforce timeout/error burst
- verificare credenziali `SALESFORCE_*`
- verificare latenza API Salesforce e retry
- ridurre pressione su query costose
- abilitare contenimento con rate limit applicativo se disponibile

### 13.3 Visibility policy stale
- verificare incremento `policy_version`
- verificare invalidazione cache policy
- se SLA propagazione superata (`>120s`): fail-closed controllato
- registrare eventi audit con `POLICY_STALE`

### 13.4 Database/PostgreSQL degrado
- verificare connessioni e saturazione
- verificare lock lunghi su tabelle visibility
- applicare purge cache scaduta se backlog alto
- escalare a DB Owner per failover/ripristino

### 13.5 Security incident
- bloccare vettore d'attacco (feature flag, ACL, endpoint)
- preservare evidenze log/audit
- ruotare secret impattati
- avviare comunicazione incident secondo policy aziendale

## 14) Cache e manutenzione operativa
Cache backend locale:
- script emergenza (se presente): `./invalidate-backend-cache.sh`
- alternativa generica: endpoint/admin command di purge cache documentato per l ambiente

Uso:
- solo in scenari controllati (degrado cache o dati obsoleti)
- dopo invalidazione, monitorare latenza e rebuild cache

## 15) Monitoraggio e alert minimi
Metriche da monitorare:
- availability API
- error rate 5xx
- spike 401/403
- latenza p95 endpoint core
- Salesforce timeout/retry
- hit/miss cache template e visibility
- SLA propagazione policy

Alert critici:
- errore continuo su login/session restore
- aumento `DENY` anomalo non previsto
- errori DB ripetuti su tabelle visibility

## 16) Backup e disaster recovery
PostgreSQL:
- backup automatico giornaliero minimo
- restore test periodico
- retention conforme policy sicurezza

Regola DR:
- nessun deploy strutturale senza backup verificato recente.

## 17) Post-mortem obbligatorio
Per incident `SEV-1/SEV-2` produrre:
- timeline con timestamp
- root cause tecnica
- impatto utenti/dati
- azioni correttive permanenti
- owner e scadenze

## 18) Checklist operativa pre-release
- [ ] release notes create (`docs/releases/RELEASE_NOTES_vX.Y.Z.md`)
- [ ] lint/build verdi
- [ ] migrazioni validate (se presenti)
- [ ] env produzione verificato
- [ ] piano rollback pronto
- [ ] owner on-call confermati

## 19) Checklist operativa post-release
- [ ] smoke test base/funzionale/sicurezza verdi
- [ ] monitoraggio stabile 15-30 minuti
- [ ] nessun alert critico aperto
- [ ] decisione go/no-go registrata

## 20) Comandi utili
```bash
# build completa
npm run build

# lint monorepo
npm run lint --workspaces

# deploy PM2
bin/deploy-pm2.sh

# release versionata
bin/create-release.sh X.Y.Z

# purge cache backend (emergenza)
./invalidate-backend-cache.sh

# migrazioni prod (se Prisma attivo)
npm exec --workspace backend prisma -- migrate deploy --schema prisma/schema.prisma
```

## 21) Documenti correlati
- `docs/architecture-overview.md`
- `docs/security-model.md`
- `docs/visibility-cones-guide.md`
- `docs/prisma-postgres-guide.md`
- `docs/query-template-guide.md`
- `docs/acl-resources-map.md`
