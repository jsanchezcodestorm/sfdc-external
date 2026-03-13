import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { normalizeEntityFormFieldConfig } from './entity-form-config.validation';

test('normalizeEntityFormFieldConfig keeps only supported form field config keys', () => {
  const result = normalizeEntityFormFieldConfig(
    {
      field: 'ParentId',
      placeholder: 'Select parent',
      lookup: {
        searchField: 'Name',
        prefill: true,
        where: [
          {
            field: 'Id',
            operator: '=',
            value: '{{parentId}}',
            parentRel: 'Account',
          },
        ],
      },
    },
    'entity.form.sections[0].fields[0]',
  );

  assert.deepEqual(result, {
    field: 'ParentId',
    placeholder: 'Select parent',
    lookup: {
      searchField: 'Name',
      prefill: true,
      where: [
        {
          field: 'Id',
          operator: '=',
          value: '{{parentId}}',
          parentRel: 'Account',
        },
      ],
      orderBy: undefined,
    },
  });
});

test('normalizeEntityFormFieldConfig rejects legacy overrides', () => {
  assert.throws(
    () =>
      normalizeEntityFormFieldConfig(
        {
          field: 'Name',
          required: true,
        },
        'entity.form.sections[0].fields[0]',
      ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'entity.form.sections[0].fields[0].required is not supported',
  );
});
