import assert from 'node:assert/strict';
import test from 'node:test';

import { MetadataEntryNormalizerService } from './services/metadata-entry-normalizer.service';

test('normalizeEntryForComparison normalizes legacy entity and ACL metadata ids', () => {
  const service = new MetadataEntryNormalizerService();

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
  const service = new MetadataEntryNormalizerService();

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
