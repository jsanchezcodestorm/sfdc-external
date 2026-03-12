import type { ConfigService } from '@nestjs/config';

const APP_EMBED_ALLOWED_HOSTS = 'APP_EMBED_ALLOWED_HOSTS';

export function readAllowedAppEmbedHosts(configService: Pick<ConfigService, 'get'>): string[] {
  const rawHosts = configService.get<string>(APP_EMBED_ALLOWED_HOSTS, '');
  return parseAllowedAppEmbedHosts(rawHosts);
}

export function parseAllowedAppEmbedHosts(rawHosts?: string): string[] {
  const source = rawHosts?.trim() ?? '';
  if (source.length === 0) {
    return [];
  }

  const entries = source.split(',').map((value) => value.trim()).filter((value) => value.length > 0);

  return [
    ...new Set(
      entries.map((value) => {
        const normalized = normalizeAllowedHostEntry(value);
        if (!normalized) {
          throw new Error(`Invalid APP_EMBED_ALLOWED_HOSTS entry: ${value}`);
        }

        return normalized;
      })
    )
  ];
}

export function extractHostFromHttpsUrl(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || !url.hostname) {
      return null;
    }

    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeAllowedHostEntry(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsedFromUrl = extractHostFromHttpsUrl(normalized);
  if (parsedFromUrl) {
    return parsedFromUrl;
  }

  return /^[a-z0-9.-]+$/i.test(normalized) ? normalized.toLowerCase() : null;
}
