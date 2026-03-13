import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { EntityAdminConfigService } from './entity-admin-config.service';

type TestField = {
  name: string;
  label?: string;
  type?: string;
  nillable?: boolean;
  createable?: boolean;
  updateable?: boolean;
  filterable?: boolean;
  defaultedOnCreate?: boolean;
  calculated?: boolean;
  autoNumber?: boolean;
  relationshipName?: string;
  referenceTo?: string[];
};

function createField(field: TestField) {
  return {
    name: field.name,
    label: field.label ?? field.name,
    type: field.type ?? 'string',
    nillable: field.nillable ?? true,
    createable: field.createable ?? false,
    updateable: field.updateable ?? false,
    filterable: field.filterable ?? false,
    defaultedOnCreate: field.defaultedOnCreate ?? false,
    calculated: field.calculated ?? false,
    autoNumber: field.autoNumber ?? false,
    relationshipName: field.relationshipName,
    referenceTo: field.referenceTo,
  };
}

function createService(fields: ReturnType<typeof createField>[]) {
  const counters = {
    ensureAclResourceCalls: 0,
    ensureVisibilityBootstrapCalls: 0,
    assertEntityIdCalls: 0,
    repositoryCalls: 0,
    auditCalls: 0,
    describeCalls: 0,
  };

  const service = new EntityAdminConfigService(
    {
      async ensureEntityResource() {
        counters.ensureAclResourceCalls += 1;
      },
    } as never,
    {
      hasResource() {
        return false;
      },
    } as never,
    {
      async ensureEntityBootstrapPolicy() {
        counters.ensureVisibilityBootstrapCalls += 1;
      },
      getResourceStatus() {
        return null;
      },
    } as never,
    {
      async syncSystemResources() {},
    } as never,
    {
      async recordApplicationSuccessOrThrow() {
        counters.auditCalls += 1;
      },
    } as never,
    {
      assertEntityId() {
        counters.assertEntityIdCalls += 1;
      },
    } as never,
    {
      async listSummaries() {
        counters.repositoryCalls += 1;
        return [];
      },
      async getEntityConfig() {
        counters.repositoryCalls += 1;
        throw new Error('not expected');
      },
      async hasEntityConfig() {
        counters.repositoryCalls += 1;
        return false;
      },
      async upsertEntityConfig() {
        counters.repositoryCalls += 1;
      },
      async deleteEntityConfig() {
        counters.repositoryCalls += 1;
      },
    } as never,
    {
      async describeObjectFields(objectApiName: string) {
        counters.describeCalls += 1;
        assert.equal(objectApiName, 'Account');
        return fields;
      },
    } as never,
  );

  return {
    service,
    counters,
  };
}

test('previewEntityBootstrap prioritizes Name in list and detail presets', async () => {
  const { service, counters } = createService([
    createField({ name: 'Id', label: 'Record ID', type: 'id', nillable: false, filterable: true }),
    createField({
      name: 'Name',
      label: 'Account Name',
      type: 'string',
      nillable: false,
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'Status__c',
      label: 'Status',
      type: 'picklist',
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({ name: 'CreatedDate', label: 'Created', type: 'datetime', filterable: true }),
  ]);

  const response = await service.previewEntityBootstrap({
    entity: {
      id: 'account',
      label: 'Account',
      objectApiName: 'Account',
    },
  });

  assert.equal(counters.describeCalls, 1);
  assert.equal(counters.assertEntityIdCalls, 1);
  assert.equal(response.entity.list?.views[0]?.query.fields?.[0], 'Id');
  assert.equal(response.entity.list?.views[0]?.query.fields?.[1], 'Name');
  assert.deepEqual(response.entity.list?.views[0]?.columns?.[0], {
    field: 'Name',
    label: 'Account Name',
  });
  assert.equal(response.entity.detail?.sections?.[0]?.fields?.[0]?.field, 'Name');
  assert.equal(response.entity.detail?.titleTemplate, '{{Name || Id}}');
});

test('previewEntityBootstrap uses only textual filterable fields for starter search', async () => {
  const { service } = createService([
    createField({ name: 'Id', label: 'Record ID', type: 'id', nillable: false, filterable: true }),
    createField({
      name: 'Name',
      type: 'string',
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'StageName',
      type: 'picklist',
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'Phone',
      type: 'phone',
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'Amount',
      type: 'currency',
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'IsClosed',
      type: 'boolean',
      createable: true,
      updateable: true,
      filterable: true,
    }),
  ]);

  const response = await service.previewEntityBootstrap({
    entity: {
      id: 'account',
      label: 'Account',
      objectApiName: 'Account',
    },
  });

  assert.deepEqual(response.entity.list?.views[0]?.search, {
    fields: ['Name', 'StageName', 'Phone'],
    minLength: 2,
  });
});

test('previewEntityBootstrap derives describe-driven form fields and omits managed fields', async () => {
  const { service } = createService([
    createField({ name: 'Id', label: 'Record ID', type: 'id', nillable: false, filterable: true }),
    createField({
      name: 'Name',
      type: 'string',
      nillable: false,
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'StageName',
      type: 'picklist',
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'IsClosed',
      type: 'boolean',
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'OwnerId',
      type: 'reference',
      createable: true,
      updateable: true,
      filterable: true,
    }),
    createField({
      name: 'CloseDate',
      type: 'date',
      createable: true,
      updateable: true,
      filterable: true,
    }),
  ]);

  const response = await service.previewEntityBootstrap({
    entity: {
      id: 'account',
      label: 'Account',
      objectApiName: 'Account',
      description: 'Commercial entity',
    },
  });

  const formFields =
    response.entity.form?.sections?.flatMap((section) => section.fields ?? []) ?? [];
  assert.deepEqual(
    formFields.map((field) => field.field),
    ['Name', 'StageName', 'CloseDate', 'IsClosed'],
  );
  assert.equal(formFields.find((field) => field.field === 'OwnerId'), undefined);
  assert.equal(formFields.find((field) => field.field === 'CloseDate')?.placeholder, undefined);
  assert.ok(response.warnings.every((warning) => !warning.includes('fallback')));
});

test('previewEntityBootstrap omits form without writable fields and stays non mutative', async () => {
  const { service, counters } = createService([
    createField({ name: 'Id', label: 'Record ID', type: 'id', nillable: false, filterable: true }),
    createField({ name: 'CreatedDate', label: 'Created', type: 'datetime', filterable: true }),
    createField({ name: 'LastModifiedDate', label: 'Modified', type: 'datetime', filterable: true }),
  ]);

  const response = await service.previewEntityBootstrap({
    entity: {
      id: 'account',
      label: 'Account',
      objectApiName: 'Account',
    },
  });

  assert.equal(response.entity.form, undefined);
  assert.ok(
    response.warnings.some((warning) =>
      warning.includes('Preset form: nessun campo Salesforce createable/updateable disponibile')
    )
  );
  assert.ok(
    response.warnings.some((warning) =>
      warning.includes('Preset list: nessun campo testuale filterable disponibile')
    )
  );
  assert.equal(counters.repositoryCalls, 0);
  assert.equal(counters.auditCalls, 0);
});

test('createEntityConfig rejects raw where clauses before touching the repository', async () => {
  const { service, counters } = createService([]);

  await assert.rejects(
    () =>
      service.createEntityConfig({
        entity: {
          id: 'account',
          label: 'Account',
          objectApiName: 'Account',
          detail: {
            query: {
              object: 'Account',
              where: ["Id = '{{id}}'"],
            },
            sections: [
              {
                title: 'Overview',
                fields: [{ field: 'Name' }],
              },
            ],
          },
        },
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'entity.detail.query.where[0] raw string clauses are not supported',
  );

  assert.equal(counters.repositoryCalls, 0);
  assert.equal(counters.auditCalls, 0);
});

test('createEntityConfig rejects unsupported query operators before touching the repository', async () => {
  const { service, counters } = createService([]);

  await assert.rejects(
    () =>
      service.createEntityConfig({
        entity: {
          id: 'account',
          label: 'Account',
          objectApiName: 'Account',
          detail: {
            query: {
              object: 'Account',
              where: [
                {
                  field: 'Id',
                  operator: 'CONTAINS',
                  value: '{{id}}',
                },
              ],
            },
            sections: [
              {
                title: 'Overview',
                fields: [{ field: 'Name' }],
              },
            ],
          },
        },
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message ===
        'entity.detail.query.where[0].operator must be one of =, !=, <, <=, >, >=, IN, NOT IN, LIKE',
  );

  assert.equal(counters.repositoryCalls, 0);
  assert.equal(counters.auditCalls, 0);
});

test('createEntityConfig rejects legacy form field overrides', async () => {
  const { service, counters } = createService([]);

  await assert.rejects(
    () =>
      service.createEntityConfig({
        entity: {
          id: 'account',
          label: 'Account',
          objectApiName: 'Account',
          form: {
            title: {
              create: 'Nuovo account',
              edit: 'Modifica account',
            },
            query: {
              object: 'Account',
              fields: ['Id', 'Name'],
            },
            sections: [
              {
                title: 'Main',
                fields: [
                  {
                    field: 'Name',
                    label: 'Custom Name',
                  },
                ],
              },
            ],
          },
        },
      }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'entity.form.sections[0].fields[0].label is not supported',
  );

  assert.equal(counters.repositoryCalls, 0);
  assert.equal(counters.auditCalls, 0);
});

test('createEntityConfig auto-provisions entity ACL resource before persistence', async () => {
  const calls: string[] = [];
  const service = new EntityAdminConfigService(
    {
      async ensureEntityResource(entityId: string) {
        calls.push(`ensure:${entityId}`);
      },
    } as never,
    {
      hasResource() {
        return true;
      },
    } as never,
    {
      async ensureEntityBootstrapPolicy(input: { entityId: string; objectApiName: string }) {
        calls.push(`visibility:${input.entityId}:${input.objectApiName}`);
      },
    } as never,
    {
      async syncSystemResources() {
        calls.push('sync');
      },
    } as never,
    {
      async recordApplicationSuccessOrThrow() {
        calls.push('audit');
      },
    } as never,
    {
      assertEntityId(entityId: string) {
        calls.push(`assert:${entityId}`);
      },
    } as never,
    {
      async listSummaries() {
        return [];
      },
      async getEntityConfig(entityId: string) {
        return {
          id: entityId,
          label: 'Account',
          objectApiName: 'Account',
        };
      },
      async hasEntityConfig() {
        return false;
      },
      async upsertEntityConfig() {
        calls.push('upsert');
      },
      async deleteEntityConfig() {},
    } as never,
    {
      async describeObjectFields() {
        return [];
      },
    } as never,
  );

  await service.createEntityConfig({
    entity: {
      id: 'account',
      label: 'Account',
      objectApiName: 'Account',
    },
  });

  assert.deepEqual(calls, [
    'assert:account',
    'ensure:account',
    'visibility:account:Account',
    'upsert',
    'sync',
    'audit',
  ]);
});

test('createEntityConfig derives id and label from objectApiName when omitted', async () => {
  const calls: string[] = [];
  const service = new EntityAdminConfigService(
    {
      async ensureEntityResource(entityId: string) {
        calls.push(`ensure:${entityId}`);
      },
    } as never,
    {
      hasResource() {
        return true;
      },
    } as never,
    {
      async ensureEntityBootstrapPolicy(input: { entityId: string; objectApiName: string }) {
        calls.push(`visibility:${input.entityId}:${input.objectApiName}`);
      },
    } as never,
    {
      async syncSystemResources() {
        calls.push('sync');
      },
    } as never,
    {
      async recordApplicationSuccessOrThrow(input: { targetId: string }) {
        calls.push(`audit:${input.targetId}`);
      },
    } as never,
    {
      assertEntityId(entityId: string) {
        calls.push(`assert:${entityId}`);
      },
    } as never,
    {
      async listSummaries() {
        return [];
      },
      async getEntityConfig(entityId: string) {
        return {
          id: entityId,
          label: 'Pricebook Entry',
          objectApiName: 'PricebookEntry',
        };
      },
      async hasEntityConfig() {
        return false;
      },
      async upsertEntityConfig(entity: { id: string; label: string }) {
        calls.push(`upsert:${entity.id}:${entity.label}`);
      },
      async deleteEntityConfig() {},
    } as never,
    {
      async describeObjectFields() {
        return [];
      },
    } as never,
  );

  const response = await service.createEntityConfig({
    entity: {
      objectApiName: 'PricebookEntry',
    },
  });

  assert.equal(response.entity.id, 'PricebookEntry');
  assert.equal(response.entity.label, 'Pricebook Entry');
  assert.deepEqual(calls, [
    'assert:PricebookEntry',
    'ensure:PricebookEntry',
    'visibility:PricebookEntry:PricebookEntry',
    'upsert:PricebookEntry:Pricebook Entry',
    'sync',
    'audit:PricebookEntry',
  ]);
});

test('createEntityConfig auto-generates a unique id when requested id already exists', async () => {
  const calls: string[] = [];
  const seenIds: string[] = [];
  const service = new EntityAdminConfigService(
    {
      async ensureEntityResource(entityId: string) {
        calls.push(`ensure:${entityId}`);
      },
    } as never,
    {
      hasResource() {
        return true;
      },
    } as never,
    {
      async ensureEntityBootstrapPolicy(input: { entityId: string; objectApiName: string }) {
        calls.push(`visibility:${input.entityId}:${input.objectApiName}`);
      },
    } as never,
    {
      async syncSystemResources() {
        calls.push('sync');
      },
    } as never,
    {
      async recordApplicationSuccessOrThrow(input: { targetId: string }) {
        calls.push(`audit:${input.targetId}`);
      },
    } as never,
    {
      assertEntityId(entityId: string) {
        calls.push(`assert:${entityId}`);
      },
    } as never,
    {
      async listSummaries() {
        return [];
      },
      async getEntityConfig(entityId: string) {
        calls.push(`get:${entityId}`);
        return {
          id: entityId,
          label: 'Listino',
          objectApiName: 'PricebookEntry',
        };
      },
      async hasEntityConfig(entityId: string) {
        seenIds.push(entityId);
        return entityId === 'Listino';
      },
      async upsertEntityConfig(entity: { id: string }) {
        calls.push(`upsert:${entity.id}`);
      },
      async deleteEntityConfig() {},
    } as never,
    {
      async describeObjectFields() {
        return [];
      },
    } as never,
  );

  const response = await service.createEntityConfig({
    entity: {
      id: 'Listino',
      label: 'Listino',
      objectApiName: 'PricebookEntry',
    },
  });

  assert.deepEqual(seenIds, ['Listino', 'Listino-2']);
  assert.equal(response.entity.id, 'Listino-2');
  assert.deepEqual(calls, [
    'assert:Listino',
    'ensure:Listino-2',
    'visibility:Listino-2:PricebookEntry',
    'upsert:Listino-2',
    'sync',
    'audit:Listino-2',
    'get:Listino-2',
  ]);
});
