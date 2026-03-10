import assert from 'node:assert/strict';
import test from 'node:test';

import { SalesforceNotConfiguredException } from '../salesforce/salesforce-not-configured.exception';

import { HealthService } from './health.service';

test('getHealth reports salesforce as not_configured without collapsing postgres state', async () => {
  const prismaService = {
    async $queryRaw() {
      return [{ '?column?': 1 }];
    },
  };

  const salesforceService = {
    async ping() {
      throw new SalesforceNotConfiguredException();
    },
  };

  const service = new HealthService(
    prismaService as never,
    salesforceService as never,
  );

  const response = await service.getHealth();

  assert.equal(response.status, 'degraded');
  assert.equal(response.checks.postgres.status, 'up');
  assert.equal(response.checks.salesforce.status, 'not_configured');
  assert.equal(response.checks.salesforce.error, 'Salesforce is not configured');
});
