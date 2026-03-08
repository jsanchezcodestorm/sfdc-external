import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { normalizeEntityQueryConfig } from './entity-query-config.validation';

test('normalizeEntityQueryConfig accepts object-based where clauses with whitelisted operators', () => {
  const query = normalizeEntityQueryConfig(
    {
      object: 'Account',
      fields: ['Id', 'Name', 'Name'],
      where: [
        {
          field: 'OwnerId',
          operator: ' not   in ',
          value: ['005000000000001AAA', '005000000000002AAA'],
        },
        {
          field: 'Name',
          operator: 'LIKE',
          value: 'Acme%',
        },
      ],
      orderBy: [{ field: 'Name', direction: 'desc' }],
      limit: 25,
    },
    'query',
  );

  assert.deepEqual(query, {
    object: 'Account',
    fields: ['Id', 'Name'],
    where: [
      {
        field: 'OwnerId',
        operator: 'NOT IN',
        value: ['005000000000001AAA', '005000000000002AAA'],
      },
      {
        field: 'Name',
        operator: 'LIKE',
        value: 'Acme%',
      },
    ],
    orderBy: [{ field: 'Name', direction: 'DESC' }],
    limit: 25,
  });
});

test('normalizeEntityQueryConfig rejects raw object clauses', () => {
  assert.throws(
    () =>
      normalizeEntityQueryConfig(
        {
          object: 'Account',
          where: [
            {
              raw: "Id = '{{id}}'",
            },
          ],
        },
        'query',
      ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'query.where[0].raw is not supported',
  );
});

test('normalizeEntityQueryConfig rejects arrays outside IN and NOT IN', () => {
  assert.throws(
    () =>
      normalizeEntityQueryConfig(
        {
          object: 'Account',
          where: [
            {
              field: 'Id',
              operator: '=',
              value: ['001'],
            },
          ],
        },
        'query',
      ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'query.where[0].value arrays are allowed only with IN or NOT IN',
  );
});

test('normalizeEntityQueryConfig rejects null outside equality operators', () => {
  assert.throws(
    () =>
      normalizeEntityQueryConfig(
        {
          object: 'Account',
          where: [
            {
              field: 'CloseDate',
              operator: '>',
              value: null,
            },
          ],
        },
        'query',
      ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'query.where[0].value null is allowed only with = or !=',
  );
});

test('normalizeEntityQueryConfig rejects non-string LIKE values', () => {
  assert.throws(
    () =>
      normalizeEntityQueryConfig(
        {
          object: 'Account',
          where: [
            {
              field: 'Name',
              operator: 'LIKE',
              value: 123,
            },
          ],
        },
        'query',
      ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'query.where[0].value must be a string for LIKE',
  );
});
