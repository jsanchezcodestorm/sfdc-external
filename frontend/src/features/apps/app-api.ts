import { apiFetch } from '../../lib/api'

import type { AvailableAppsResponse } from './app-types'

export async function fetchAvailableApps(): Promise<AvailableAppsResponse> {
  return apiFetch<AvailableAppsResponse>('/apps/available')
}
