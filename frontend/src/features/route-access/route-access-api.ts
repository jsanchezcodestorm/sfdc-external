import { apiFetch } from '../../lib/api'

import type { NavigationRoutesResponse } from './route-access-types'

export async function fetchRouteAccessNavigation(): Promise<NavigationRoutesResponse> {
  return apiFetch<NavigationRoutesResponse>('/navigation')
}
