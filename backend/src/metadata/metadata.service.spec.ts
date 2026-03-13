import assert from 'node:assert/strict';
import test from 'node:test';

import { MetadataAdminService } from './metadata.service';

function createService(): MetadataAdminService {
  return new MetadataAdminService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

test('normalizeEntryForComparison normalizes legacy entity and ACL metadata ids', () => {
  const service = createService() as unknown as {
    normalizeEntryForComparison: (typeName: string, member: string, value: unknown) => Record<string, unknown>;
  };

  const entity = service.normalizeEntryForComparison('EntityConfig', 'Contact', {
    id: 'Contact',
    label: 'Contact',
    objectApiName: 'Contact',
    detail: {
      query: {
        object: 'Contact',
        fields: ['Id'],
      },
      sections: [],
      relatedLists: [
        {
          id: 'accounts',
          label: 'Accounts',
          query: { object: 'Account', fields: ['Id'] },
          columns: ['Id'],
          entityId: 'Opportunity',
        },
      ],
    },
  });

  assert.equal(entity.id, 'contact');
  assert.deepEqual(entity.detail, {
    query: {
      object: 'Contact',
      fields: ['Id'],
    },
    sections: [],
    relatedLists: [
      {
        id: 'accounts',
        label: 'Accounts',
        query: { object: 'Account', fields: ['Id'] },
        columns: ['Id'],
        entityId: 'opportunity',
      },
    ],
  });

  const resource = service.normalizeEntryForComparison('AclResource', 'entity:Product2', {
    id: 'entity:Product2',
    type: 'entity',
    accessMode: 'disabled',
    managedBy: 'system',
    syncState: 'present',
    sourceType: 'entity',
    sourceRef: 'Product2',
    permissions: [],
  });

  assert.equal(resource.id, 'entity:product2');
  assert.equal(resource.sourceRef, 'product2');
});

test('normalizeEntryForComparison normalizes legacy app item entity references', () => {
  const service = createService() as unknown as {
    normalizeEntryForComparison: (typeName: string, member: string, value: unknown) => Record<string, unknown>;
  };

  const app = service.normalizeEntryForComparison('AppConfig', 'sales', {
    id: 'sales',
    label: 'Sales',
    permissionCodes: [],
    items: [
      {
        id: 'home',
        kind: 'home',
        label: 'Home',
        page: { blocks: [] },
      },
      {
        id: 'contacts',
        kind: 'entity',
        label: 'Contacts',
        entityId: 'Contact',
        resourceId: 'entity:Contact',
      },
    ],
  });

  assert.deepEqual(app.items, [
    {
      entityId: undefined,
      id: 'home',
      kind: 'home',
      label: 'Home',
      page: { blocks: [] },
      resourceId: undefined,
    },
    {
      id: 'contacts',
      kind: 'entity',
      label: 'Contacts',
      entityId: 'contact',
      resourceId: 'entity:contact',
    },
  ]);
});

test('normalizeEntryForComparison converts legacy app entityIds to app items', () => {
  const service = createService() as unknown as {
    normalizeEntryForComparison: (typeName: string, member: string, value: unknown) => Record<string, unknown>;
  };

  const app = service.normalizeEntryForComparison('AppConfig', 'contact', {
    id: 'contact',
    label: 'Sales',
    permissionCodes: ['PORTAL_USER'],
    entityIds: ['account', 'Contact', 'Opportunity'],
  });

  assert.deepEqual(app.items, [
    {
      id: 'home',
      kind: 'home',
      label: 'Home',
      page: { blocks: [] },
    },
    {
      id: 'account',
      kind: 'entity',
      label: 'account',
      entityId: 'account',
      resourceId: 'entity:account',
    },
    {
      id: 'contact',
      kind: 'entity',
      label: 'Contact',
      entityId: 'contact',
      resourceId: 'entity:contact',
    },
    {
      id: 'opportunity',
      kind: 'entity',
      label: 'Opportunity',
      entityId: 'opportunity',
      resourceId: 'entity:opportunity',
    },
  ]);
});

test('normalizeEntryForComparison strips legacy entity form field presentation keys', () => {
  const service = createService() as unknown as {
    normalizeEntryForComparison: (typeName: string, member: string, value: unknown) => Record<string, unknown>;
  };

  const entity = service.normalizeEntryForComparison('EntityConfig', 'account', {
    id: 'account',
    label: 'Accounts',
    objectApiName: 'Account',
    form: {
      title: {
        create: 'New Account',
        edit: 'Edit Account',
      },
      query: {
        object: 'Account',
        fields: ['Id', 'Name'],
      },
      sections: [
        {
          title: 'Main Information',
          fields: [
            {
              field: 'Name',
              label: 'Name',
              inputType: 'text',
              required: true,
              placeholder: 'Account name',
            },
          ],
        },
      ],
    },
  });

  assert.deepEqual(entity.form, {
    title: {
      create: 'New Account',
      edit: 'Edit Account',
    },
    query: {
      object: 'Account',
      fields: ['Id', 'Name'],
    },
    sections: [
      {
        title: 'Main Information',
        fields: [
          {
            field: 'Name',
            placeholder: 'Account name',
          },
        ],
      },
    ],
  });
});

test('normalizeEntryForComparison normalizes legacy bootstrap cone codes', () => {
  const service = createService() as unknown as {
    normalizeEntryForComparison: (typeName: string, member: string, value: unknown) => Record<string, unknown>;
  };

  const cone = service.normalizeEntryForComparison('VisibilityCone', 'entity-c-bootstrap', {
    code: 'entity-C-bootstrap',
    name: 'Entity C bootstrap',
    priority: 0,
    active: true,
  });

  assert.deepEqual(cone, {
    code: 'entity-c-bootstrap',
    name: 'Entity C bootstrap',
    priority: 0,
    active: true,
  });
});

test('normalizeEntryForComparison accepts legacy bootstrap cone file names', () => {
  const service = createService() as unknown as {
    normalizeEntryForComparison: (typeName: string, member: string, value: unknown) => Record<string, unknown>;
  };

  const cone = service.normalizeEntryForComparison('VisibilityCone', 'entity-Contact-bootstrap', {
    code: 'entity-Contact-bootstrap',
    name: 'Entity Contact bootstrap',
    priority: 0,
    active: true,
  });

  assert.deepEqual(cone, {
    code: 'entity-contact-bootstrap',
    name: 'Entity Contact bootstrap',
    priority: 0,
    active: true,
  });
});
