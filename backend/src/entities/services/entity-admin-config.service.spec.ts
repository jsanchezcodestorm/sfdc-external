import assert from 'node:assert/strict';
import test from 'node:test';

import { EntityAdminConfigService } from './entity-admin-config.service';

type TestField = {
  name: string;
  label?: string;
  type?: string;
  nillable?: boolean;
  createable?: boolean;
  updateable?: boolean;
  filterable?: boolean;
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
    relationshipName: field.relationshipName,
    referenceTo: field.referenceTo,
  };
}

function createService(fields: ReturnType<typeof createField>[]) {
  const counters = {
    assertKebabCaseIdCalls: 0,
    repositoryCalls: 0,
    auditCalls: 0,
    describeCalls: 0,
  };

  const service = new EntityAdminConfigService(
    {
      hasResource() {
        return false;
      },
    } as never,
    {
      async recordApplicationSuccessOrThrow() {
        counters.auditCalls += 1;
      },
    } as never,
    {
      assertKebabCaseId() {
        counters.assertKebabCaseIdCalls += 1;
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
  assert.equal(counters.assertKebabCaseIdCalls, 1);
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

test('previewEntityBootstrap generates an aggressive form and reports text fallbacks', async () => {
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
  assert.equal(formFields.find((field) => field.field === 'StageName')?.inputType, 'text');
  assert.equal(formFields.find((field) => field.field === 'IsClosed')?.inputType, 'text');
  assert.equal(formFields.find((field) => field.field === 'OwnerId')?.inputType, 'text');
  assert.equal(formFields.find((field) => field.field === 'CloseDate')?.inputType, 'date');
  assert.ok(
    response.warnings.some(
      (warning) =>
        warning.includes('StageName (picklist)') &&
        warning.includes('IsClosed (boolean)') &&
        warning.includes('OwnerId (reference)')
    )
  );
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
