import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { normalizeAclResourceConfigInput } from './acl-config.validation';

test('normalizeAclResourceConfigInput accepts Salesforce-style entity resource ids', () => {
  const resource = normalizeAclResourceConfigInput(
    {
      id: 'entity:Product2',
      type: 'entity',
      permissions: [],
    },
    'resource'
  );

  assert.equal(resource.id, 'entity:Product2');
});

test('normalizeAclResourceConfigInput rejects non-kebab-case non-entity resource ids', () => {
  assert.throws(
    () =>
      normalizeAclResourceConfigInput(
        {
          id: 'rest:EntitiesRead',
          type: 'rest',
          permissions: [],
        },
        'resource'
      ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'resource.id must use lowercase kebab-case for rest ids'
  );
});
