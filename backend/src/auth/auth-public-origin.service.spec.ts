import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthPublicOriginService } from './auth-public-origin.service';

function createService(frontendOrigins = 'http://localhost:5173,https://app.example.com') {
  return new AuthPublicOriginService({
    get(key: string, fallback?: string) {
      if (key === 'FRONTEND_ORIGINS') {
        return frontendOrigins;
      }

      return fallback;
    }
  } as never);
}

test('resolveAllowedOrigin prefers the request Origin header when it is allowed', () => {
  const service = createService();

  const origin = service.resolveAllowedOrigin({
    headers: {
      origin: 'http://localhost:5173'
    },
    protocol: 'http',
    get() {
      return 'localhost:3000';
    }
  } as never);

  assert.equal(origin, 'http://localhost:5173');
});

test('resolveAllowedOrigin falls back to forwarded host/proto when headers are proxied', () => {
  const service = createService();

  const origin = service.resolveAllowedOrigin({
    headers: {
      'x-forwarded-host': 'app.example.com',
      'x-forwarded-proto': 'https'
    },
    protocol: 'http',
    get() {
      return 'localhost:3000';
    }
  } as never);

  assert.equal(origin, 'https://app.example.com');
});

test('resolveAllowedOrigin returns null when the derived origin is not allowed', () => {
  const service = createService();

  const origin = service.resolveAllowedOrigin({
    headers: {
      origin: 'https://evil.example.com'
    },
    protocol: 'https',
    get() {
      return 'evil.example.com';
    }
  } as never);

  assert.equal(origin, null);
});
