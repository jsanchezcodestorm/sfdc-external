# Metadata Package Guide

## Scopo
Questo documento descrive il formato ufficiale dei package metadata amministrativi usati per portare la configurazione di `/#/admin/` tra ambienti diversi.

## Formato package
- trasporto: file `.zip`
- contenuti: file YAML testuali UTF-8
- descrittore radice obbligatorio: `package.yaml`
- serializzazione: newline `\n`, indentazione 2 spazi, chiavi ordinate deterministicamente

## Contract `package.yaml`
Campi obbligatori:
- `version: 1`
- `format: sfdc-external-admin-package`
- `contactMapping: email`
- `secretPolicy: none`
- `deployMode: upsert`
- `types[]`
- `manualTypes[]`

`types[]` copre i record deployable.
`manualTypes[]` copre i record esportati solo come inventory/manual action.

## Layout file
- `entities/<entityId>.yaml`
- `apps/<appId>.yaml`
- `acl/permissions/<permissionCode>.yaml`
- `acl/resources/<percent-encoded-resourceId>.yaml`
- `acl/default-permissions/<permissionCode>.yaml`
- `acl/contact-permissions/<percent-encoded-contactEmail>.yaml`
- `query-templates/<templateId>.yaml`
- `visibility/cones/<coneCode>.yaml`
- `visibility/rules/<ruleId>.yaml`
- `visibility/assignments/<assignmentId>.yaml`
- `manual/auth-providers/<providerId>.yaml`
- `manual/local-credentials/<percent-encoded-contactEmail>.yaml`

## Deploy semantics
- modalita supportata v1: `upsert`
- ogni file presente crea o aggiorna il proprio record
- i file assenti non cancellano nulla sul target
- il preview produce diff `create | update | unchanged`
- il deploy richiede `packageHash` e `targetFingerprint` coerenti con il preview immediatamente precedente

## Mapping Contact
- tutti i riferimenti nominativi cross-environment usano `Contact.Email`
- `contactRef.sourceId` e informativo e non governa il mapping di deploy
- se l email non e risolvibile in modo univoco sul target, il preview genera blocker e il deploy viene rifiutato

## Scope deployable v1
- `entities`
- `apps`
- `acl`
- `aclContactPermissions`
- `queryTemplates`
- `visibility`

## Scope manual-only v1
- `authProviders`
- `localCredentials`

Questi file vengono esportati nel package ma non sono applicati dal deploy automatico, perche `secretPolicy` resta `none`.
