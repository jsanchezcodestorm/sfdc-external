import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { EntityConfigRepository } from './entity-config.repository';

test('getEntityConfig fails closed when persisted queryJson contains a raw where string', async () => {
  const repository = new EntityConfigRepository(
    {
      entityConfigRecord: {
        async findUnique() {
          return {
            id: 'account',
            objectApiName: 'Account',
            label: 'Account',
            description: null,
            navigationJson: null,
            listConfig: {
              title: 'Accounts',
              subtitle: null,
              primaryActionJson: null,
              views: [
                {
                  viewId: 'all',
                  label: 'All',
                  description: null,
                  isDefault: true,
                  pageSize: 25,
                  queryJson: {
                    object: 'Account',
                    where: ["Id = '{{id}}'"],
                  },
                  columnsJson: [{ field: 'Name', label: 'Name' }],
                  searchJson: null,
                  primaryActionJson: null,
                  rowActionsJson: null,
                },
              ],
            },
            detailConfig: null,
            formConfig: null,
          };
        },
      },
    } as never,
  );

  await assert.rejects(
    () => repository.getEntityConfig('account'),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message ===
        'Entity list view config account/all is invalid: query.where[0] raw string clauses are not supported',
  );
});

test('getEntityConfig fails closed when persisted form fields still contain legacy overrides', async () => {
  const repository = new EntityConfigRepository(
    {
      entityConfigRecord: {
        async findUnique() {
          return {
            id: 'account',
            objectApiName: 'Account',
            label: 'Account',
            description: null,
            navigationJson: null,
            listConfig: null,
            detailConfig: null,
            formConfig: {
              createTitle: 'Nuovo account',
              editTitle: 'Modifica account',
              subtitle: null,
              queryJson: {
                object: 'Account',
                fields: ['Id', 'Name'],
              },
              sections: [
                {
                  title: 'Main',
                  fieldsJson: [
                    {
                      field: 'Name',
                      label: 'Custom Name',
                    },
                  ],
                },
              ],
            },
          };
        },
      },
    } as never,
  );

  await assert.rejects(
    () => repository.getEntityConfig('account'),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Entity form section config account.fields[0].label is not supported',
  );
});
