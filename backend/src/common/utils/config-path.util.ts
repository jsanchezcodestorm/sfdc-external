import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveConfigFile(relativePath: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'config', relativePath),
    path.resolve(process.cwd(), 'backend/config', relativePath)
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
