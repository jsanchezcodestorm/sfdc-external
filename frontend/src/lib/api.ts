import { ApiError, createCookieApiClient } from '@platform/http-client'

const {
  apiFetch,
  apiFetchBlob,
  clearCsrfToken,
  setCsrfToken,
} = createCookieApiClient({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
})

export { ApiError, apiFetch, apiFetchBlob, clearCsrfToken, setCsrfToken }

export type HealthCheckResponse = {
  status: string
  timestamp: string
}

export function fetchHealthCheck(): Promise<HealthCheckResponse> {
  return apiFetch<HealthCheckResponse>('/health')
}
