type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: BodyInit | Record<string, unknown>
  headers?: HeadersInit
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const CSRF_HEADER_NAME = 'X-CSRF-Token'
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let csrfToken: string | null = null
let csrfBootstrapPromise: Promise<string> | null = null

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(`API ${status}: ${message}`)
    this.name = 'ApiError'
    this.status = status
  }
}

type CsrfTokenResponse = {
  csrfToken: string
}

function buildUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}

function shouldSerializeAsJson(body: ApiRequestOptions['body']): boolean {
  if (body === undefined) {
    return false
  }

  return !(
    typeof body === 'string' ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  )
}

async function parseError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { message?: string }
      return payload.message ?? JSON.stringify(payload)
    }

    const text = await response.text()
    return text || response.statusText
  } catch {
    return response.statusText || 'Request failed'
  }
}

function isUnsafeMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase())
}

function extractCsrfToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const token = (payload as Partial<CsrfTokenResponse>).csrfToken
  if (typeof token !== 'string') {
    return null
  }

  const normalized = token.trim()
  return normalized ? normalized : null
}

export function setCsrfToken(nextToken: string): void {
  const normalized = nextToken.trim()
  csrfToken = normalized ? normalized : null
}

export function clearCsrfToken(): void {
  csrfToken = null
}

async function bootstrapCsrfToken(): Promise<string> {
  const response = await fetch(buildUrl('/auth/csrf'), {
    credentials: 'include',
  })

  if (!response.ok) {
    const message = await parseError(response)
    throw new ApiError(response.status, message)
  }

  const payload = (await response.json()) as unknown
  const nextToken = extractCsrfToken(payload)

  if (!nextToken) {
    throw new ApiError(response.status, 'Invalid CSRF bootstrap response')
  }

  setCsrfToken(nextToken)
  return nextToken
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = bootstrapCsrfToken()
  }

  try {
    return await csrfBootstrapPromise
  } finally {
    csrfBootstrapPromise = null
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers, ...init } = options
  const method = (init.method ?? 'GET').toUpperCase()
  const requiresCsrf = isUnsafeMethod(method)
  const serializeAsJson = shouldSerializeAsJson(body)
  const requestHeaders = new Headers(headers)

  if (serializeAsJson && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (requiresCsrf) {
    requestHeaders.set(CSRF_HEADER_NAME, await getCsrfToken())
  }

  const requestBody: BodyInit | undefined = serializeAsJson
    ? JSON.stringify(body)
    : (body as BodyInit | undefined)

  const response = await fetch(buildUrl(path), {
    ...init,
    method,
    headers: requestHeaders,
    credentials: 'include',
    body: requestBody,
  })

  if (!response.ok) {
    const message = await parseError(response)
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as unknown
    const nextToken = extractCsrfToken(payload)

    if (nextToken) {
      setCsrfToken(nextToken)
    }

    return payload as T
  }

  return (await response.text()) as T
}

export async function apiFetchBlob(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ blob: Blob; headers: Headers }> {
  const { body, headers, ...init } = options
  const method = (init.method ?? 'GET').toUpperCase()
  const requiresCsrf = isUnsafeMethod(method)
  const serializeAsJson = shouldSerializeAsJson(body)
  const requestHeaders = new Headers(headers)

  if (serializeAsJson && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (requiresCsrf) {
    requestHeaders.set(CSRF_HEADER_NAME, await getCsrfToken())
  }

  const requestBody: BodyInit | undefined = serializeAsJson
    ? JSON.stringify(body)
    : (body as BodyInit | undefined)

  const response = await fetch(buildUrl(path), {
    ...init,
    method,
    headers: requestHeaders,
    credentials: 'include',
    body: requestBody,
  })

  if (!response.ok) {
    const message = await parseError(response)
    throw new ApiError(response.status, message)
  }

  return {
    blob: await response.blob(),
    headers: response.headers,
  }
}

export type HealthCheckResponse = {
  status: string
  timestamp: string
}

export function fetchHealthCheck(): Promise<HealthCheckResponse> {
  return apiFetch<HealthCheckResponse>('/health')
}
