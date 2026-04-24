import type { ConfigService } from '@nestjs/config';

export function readAllowedFrontendOrigins(configService: Pick<ConfigService, 'get'>): string[] {
  const rawOrigins = configService.get<string>('FRONTEND_ORIGINS')?.trim();
  if (!rawOrigins) {
    throw new Error('FRONTEND_ORIGINS is required');
  }
  return parseAllowedFrontendOrigins(rawOrigins);
}

export function parseAllowedFrontendOrigins(rawOrigins?: string): string[] {
  const source = rawOrigins?.trim();
  if (!source) {
    throw new Error('FRONTEND_ORIGINS is required');
  }
  const entries = source
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (entries.length === 0) {
    throw new Error('FRONTEND_ORIGINS must include at least one valid origin');
  }

  return [
    ...new Set(
      entries.map((value) => {
        const normalized = normalizeOrigin(value);
        if (!normalized) {
          throw new Error(`Invalid FRONTEND_ORIGINS entry: ${value}`);
        }

        return normalized;
      })
    )
  ];
}

export function extractRequestOrigin(originHeader?: string, refererHeader?: string): string | null {
  const normalizedOrigin = normalizeOrigin(originHeader);
  if (normalizedOrigin) {
    return normalizedOrigin;
  }

  return normalizeOrigin(refererHeader);
}

function normalizeOrigin(value?: string): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}
