import assert from 'node:assert/strict';
import test from 'node:test';

import type { VisibilityEvaluation } from '../../visibility/visibility.types';

import { ReportSoqlBuilderService } from './report-soql-builder.service';

function createVisibility(overrides?: Partial<VisibilityEvaluation>): VisibilityEvaluation {
  return {
    decision: 'ALLOW',
    reasonCode: 'TEST',
    policyVersion: 1,
    objectPolicyVersion: 1,
    objectApiName: 'Account',
    contactId: '003TESTCONTACT001',
    appliedCones: [],
    appliedRules: [],
    ...overrides,
  };
}

test('buildAggregateQuery orders grouped aggregates by aggregate expression instead of alias', () => {
  const service = new ReportSoqlBuilderService();

  const result = service.buildAggregateQuery(
    {
      objectApiName: 'Account',
      filters: [],
    },
    createVisibility(),
    {
      dimensionField: 'Name',
      metricOperation: 'COUNT',
      sortDirection: 'DESC',
      limit: 10,
    },
  );

  assert.match(
    result.soql,
    /^SELECT Name, COUNT\(Id\) metricValue FROM Account GROUP BY Name ORDER BY COUNT\(Id\) DESC, Name ASC LIMIT 10$/,
  );
  assert.doesNotMatch(result.soql, /ORDER BY metricValue\b/);
});
