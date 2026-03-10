import { apiFetch } from '../../lib/api'

import type {
  CompleteSetupRequest,
  SetupSalesforceTestResponse,
  SetupStatusResponse,
} from './setup-types'

export async function fetchSetupStatus(): Promise<SetupStatusResponse> {
  return apiFetch<SetupStatusResponse>('/setup/status')
}

export async function testSalesforceSetup(
  salesforce: CompleteSetupRequest['salesforce'],
): Promise<SetupSalesforceTestResponse> {
  return apiFetch<SetupSalesforceTestResponse>('/setup/salesforce-test', {
    method: 'POST',
    body: {
      salesforce,
    },
  })
}

export async function completeInitialSetup(
  payload: CompleteSetupRequest,
): Promise<SetupStatusResponse> {
  return apiFetch<SetupStatusResponse>('/setup/complete', {
    method: 'POST',
    body: payload,
  })
}
