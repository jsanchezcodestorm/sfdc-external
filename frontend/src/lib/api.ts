type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: BodyInit | Record<string, unknown>
  headers?: HeadersInit
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

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

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers, ...init } = options
  const serializeAsJson = shouldSerializeAsJson(body)
  const requestHeaders = new Headers(headers)

  if (serializeAsJson && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  const requestBody: BodyInit | undefined = serializeAsJson
    ? JSON.stringify(body)
    : (body as BodyInit | undefined)

  const response = await fetch(buildUrl(path), {
    ...init,
    headers: requestHeaders,
    credentials: 'include',
    body: requestBody,
  })

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await parseError(response)}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  return (await response.text()) as T
}

export type HealthCheckResponse = {
  status: string
  timestamp: string
}

export function fetchHealthCheck(): Promise<HealthCheckResponse> {
  return apiFetch<HealthCheckResponse>('/health')
}
