import { HttpException } from '@nestjs/common';
import { RequestContextService } from '../audit/request-context.service';

type PlatformRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: BodyInit | Record<string, unknown>;
  headers?: HeadersInit;
};

export class PlatformHttpError extends HttpException {
  constructor(status: number, message: string) {
    super(message, status);
    this.name = 'PlatformHttpError';
  }
}

function readRequiredBaseUrl(envKey: 'PLATFORM_AUTH_SERVICE_URL' | 'PLATFORM_CONNECTORS_SERVICE_URL'): string {
  const fallback =
    envKey === 'PLATFORM_AUTH_SERVICE_URL' ? 'http://localhost:3100' : 'http://localhost:3200';
  return (process.env[envKey] ?? fallback).replace(/\/+$/, '');
}

function buildInternalHeaders(headers?: HeadersInit): Headers {
  const resolved = new Headers(headers);
  resolved.set(
    'x-platform-internal-token',
    process.env.PLATFORM_INTERNAL_TOKEN ?? 'platform-local-stack-internal-token'
  );
  const sessionToken = RequestContextService.getSessionToken();
  if (sessionToken && !resolved.has('authorization')) {
    resolved.set('authorization', `Bearer ${sessionToken}`);
  }
  return resolved;
}

function buildUrl(baseUrl: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function parseError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { message?: string };
      return payload.message ?? JSON.stringify(payload);
    }

    const text = await response.text();
    return text || response.statusText;
  } catch {
    return response.statusText || 'Request failed';
  }
}

async function platformFetchJson<T = unknown>(
  baseUrl: string,
  path: string,
  options: PlatformRequestOptions = {}
): Promise<T> {
  const { body, headers, ...init } = options;
  const requestHeaders = buildInternalHeaders(headers);
  const method = (init.method ?? 'GET').toUpperCase();
  const isJsonBody =
    body !== undefined &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof Blob) &&
    typeof body !== 'string';

  if (body !== undefined && !requestHeaders.has('content-type') && isJsonBody) {
    requestHeaders.set('content-type', 'application/json');
  }

  const response = await fetch(buildUrl(baseUrl, path), {
    ...init,
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : isJsonBody ? JSON.stringify(body) : body
  });

  if (!response.ok) {
    throw new PlatformHttpError(response.status, await parseError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function platformAuthJson<T = unknown>(
  path: string,
  options?: PlatformRequestOptions
): Promise<T> {
  return platformFetchJson<T>(readRequiredBaseUrl('PLATFORM_AUTH_SERVICE_URL'), path, options);
}

export function platformConnectorsJson<T = unknown>(
  path: string,
  options?: PlatformRequestOptions
): Promise<T> {
  return platformFetchJson<T>(readRequiredBaseUrl('PLATFORM_CONNECTORS_SERVICE_URL'), path, options);
}
